# DEC-1 v4: Statement Decoder Real-World Consolidation

Repository: anto-beep/Wayly-Web-App
This version supersedes all prior DEC-1 versions including Emergent's internal v7.7. Owner sign-off required before merge.

## Preface: What Went Wrong

Prior versions of DEC-1 focused on the divergence between two pathways and on specific defects (1970 dates, MM/DD locale swap, invented service codes, empty-ABN false positives, recurring-service false positives). All of those fixes were necessary. None of them was sufficient, because the fixtures used to prove the fixes were built around one narrow archetype: multi-provider Class 8 statements with hours-only units, hardcoded 10% care management, per-line contribution splits, and full DD/MM/YYYY dates.

Real-world Support at Home statements do not match this archetype. When a real statement was decoded — Margaret Wilson, June 2026, Better Care at Home Services Pty Ltd — four extraction failures and one anomaly-detection miss appeared, none of which the DEC-1 v7.7 test suite would have caught:

1. Short-form dates (`02/06` with year inferred from period header) were silently dropped by the hardened DD/MM/YYYY parser. Sixteen of seventeen date fields came back blank. Care management was the only line with a date because it used the full DD/MM/YYYY format.
2. Non-hour units (`18 km`, `22 km`, `1 session`) were flattened into an "Hrs" column. The `km` and `session` unit labels were discarded. Transport shows as "18 hours."
3. Per-line contribution and government-paid values were fabricated by applying a uniform 10% split to every line. The source only provides aggregate contribution and government-paid figures. The fabricated per-line values sum to $195.10; the source aggregate is $197.25. Two conflicting numbers for "you paid" appear on the same decoded document.
4. Care management fee of $142.50 is 7.22% of the declared total, not 10%. The decoder passed this through without comment. The DEC-1 rule "care management is 10% of the fee base" was baked in as an assumption, not extracted from the source.
5. The source itself has a $21.50 arithmetic gap between its declared services total ($1,972.50) and the sum of its own line items ($1,951.00). The decoder returned zero non-info anomalies. The exact class of defect the S3 fixture was designed to catch was silently accepted on a real statement.

This document rebuilds DEC-1 around what Support at Home statements actually look like, verified against the Department of Health and Aged Care's published requirements and the industry guidance for provider software vendors.

## Real-World Support at Home Statement Anatomy

Verified against Department of Health and Aged Care requirements (Chapter 17 of the Support at Home Program Manual) and industry practice as of November 2025 onward.

**Mandatory content in every monthly statement:**
- Total government funding available to the participant that month
- Participant contributions, if applicable (aggregate)
- Services delivered: type, quantity with unit, price per service
- Total service costs for the month
- Any unspent funding (remaining balance)
- Closing balance
- Adjustments or refunds from previous months
- Committed funds for AT-HM items not yet delivered
- Expiry dates for AT-HM funding
- Care management hours or units delivered that month
- Total participant contributions paid

**Legal requirements:**
- Statements must be issued monthly, covering the previous calendar month, delivered by the last day of the following month
- Statements must be issued even if no services were delivered that month
- Delivered to the participant, their registered supporter, or both

**Service categories with different contribution treatment:**
- **Clinical support** (nursing, allied health, physiotherapy, OT): no participant contribution
- **Independence** (personal care, social support, transport, assistive technology): moderate contribution
- **Everyday living** (domestic assistance, gardening, meal preparation): highest contribution
- From 1 October 2026: personal care becomes fully government-funded (zero participant contribution)

**Structural variations Wayly must handle:**
- Ongoing Support at Home funding (8 classifications, quarterly budgets released July / October / January / April)
- Restorative Care Pathway (up to $6,000 per 16-week episode, or up to $12,000 for eligible participants)
- End-of-Life Pathway (approximately $25,000 over 12 weeks, up to 16 weeks total)
- Assistive Technology and Home Modifications (AT-HM) scheme (separate 12-month funding)
- Interim funding at 60% of full allocation (while awaiting full amount)
- Combinations of the above on one participant's records

**Date format variations observed:**
- Short-form: `02/06` with year inferred from statement period header
- Full: `02/06/2026`
- ISO: `2026-06-02`
- Two-digit year: `02/06/26`
- Written: `2 June 2026`, `2-Jun-2026`

**Unit variations observed:**
- `hr` or `hrs` or `hour` or `hours`
- `km` (transport, per kilometre)
- `session` (allied health, physiotherapy, some social)
- `visit` (some nursing structures)
- `ea` or `each` (AT-HM items, meal packs)
- `day` (respite, residential-adjacent)

**Contribution presentation variations:**
- Aggregate only (source shows one participant contribution figure for the whole month) — Margaret's case
- Per-line (source shows a contribution and government-paid split against each line item) — Louisa's case in my fixtures
- Percentage-labelled (source shows "at 10% contribution rate for independence services")
- Category-aggregated (source shows one figure per category)

**Provider terminology variations:**
- Clinical / Clinical supports / Clinical support services / Nursing & allied health
- Independence / Independent living / Independence supports
- Everyday living / Everyday Living / EDL / Domestic supports
- Amount / Total / Gross / Cost / Charge / Fee / Line total
- Care management / Package management / Care coordination / Administration

**Special conditions the decoder may encounter:**
- Zero-service months (statement issued but no services delivered)
- Full pensioner with "no worse off" protection (zero contribution across everything)
- Post-1 October 2026 statements where personal care shows zero contribution
- Lifetime cap reached ($135,318.69 as of November 2025, indexed twice yearly)
- Financial hardship supplement active
- HCP legacy fields during transition
- Adjustments and refunds from prior months
- Committed but not delivered AT-HM items

## Non-Negotiable Principles

Same as prior DEC-1 versions. Australian English, no em dashes, sentence case body, `%` symbol, dollar amounts formatted as `$1,847`. WCAG 2.1 AAA. The decoder informs, it does not advise. Deterministic behaviour. Legislative figures verified before hardcoding. Audit before implementing.

## Invariants

These must hold for every decode, through every route.

1. **Single compute source.** Extraction, normalisation, computation, and anomaly detection run exactly once, in one shared module.
2. **Identity holds.** `gross_total = participant_contribution + government_paid` to the cent, or the source violation is flagged.
3. **No fabrication.** The engine never emits a value not present in or derivable from the source. Null stays null.
4. **Impact is real money at risk.** Each at-risk dollar in at most one anomaly. Sum of impacts ≤ gross total. Legitimate spend carries $0 impact.
5. **Flexible date parsing.** The parser accepts DD/MM, DD/MM/YY, DD/MM/YYYY, YYYY-MM-DD, and written formats (`2 June 2026`, `2-Jun-2026`). Short-form dates resolve using the statement period's year and month range for context. A parse failure raises visibly. Never epoch. Never MM/DD interpretation of DD/MM.
6. **Complete row extraction.** Every row in the source table produces one row in the structured result. Blank date on a row where the source has a date is a hard failure.
7. **Deterministic anomaly ruleset.** Same structured input, twice, produces the same anomaly list byte-for-byte.
8. **Single persistence and read model.** Every entry point writes one canonical record to one store. The Statements tab reads that store.
9. **Single render pipeline per surface.** Summary, detail, and PDF each produced by one renderer over the shared record.
10. **Cadence is inferred.** 28-31 days = monthly; 88-92 days = quarterly; 6-8 days = weekly; 13-15 days = fortnightly. No cadence flagged as anomalous.
11. **Units are first-class.** Every line item has an explicit `unit` field with values from a fixed vocabulary: `hr`, `km`, `session`, `visit`, `ea`, `day`. Raw source text is preserved. The renderer displays the correct unit. No "Hrs" default column.
12. **Aggregate-only fields stay aggregate.** If the source provides only aggregate participant contribution and government-paid figures, the decoder does not synthesise per-line values by applying a percentage rule. Per-line contribution and government-paid fields are null in the structured result, and the UI shows blank for those columns.
13. **Care management is extracted, not assumed.** The care management fee amount comes from the source. The decoder does not assume 10% and does not silently accept values wildly different from 10% without flagging. A fee substantially below 10% is noted at INFO. A fee substantially above 10% is flagged at HIGH.
14. **Source arithmetic is checked.** Sum of line item Amount values is compared to the source's declared services total. Any discrepancy over $0.00 is flagged at MEDIUM, matching the S3.D2 defect pattern.
15. **Source order is preserved.** Line items appear in the order they appear in the source. No re-sorting by amount or category.
16. **Zero-service months are handled.** A statement with zero service lines is not flagged as anomalous. The decoder recognises the "even if no services delivered" case and produces a valid decoded record.


## Anti-Hallucination Requirements (specific instances of Invariant 3)

Invariant 3 forbids fabrication. This section makes the constraint concrete by naming the specific fabrication patterns observed in prior decoder outputs. Any of these is a shipping-block failure.

**F1. Fabricated fields.** If the source does not contain the letters "GST" anywhere, the decoder must not raise a GST-related anomaly. Applied more generally: if the source does not contain a specific term or field, no anomaly may be raised that references that term or field. Before emitting an anomaly, the decoder must confirm that every specific field, term, and dollar figure cited in the anomaly text is traceable to a specific location in the source.

**F2. Fabricated per-line values.** The Louisa-style fixtures show per-line participant contribution and government-paid figures. Margaret-style fixtures show only aggregate contribution and government-paid figures. The decoder must not synthesise per-line values by applying a percentage rule to per-line grosses when the source only provides aggregates. Blank means blank.

**F3. Fabricated service codes.** If the source contains no service codes, the structured result contains no service codes. Never emit `NU-`, `PT-`, `PC-001`, `DA-001` or any code the source did not include.

**F4. Fabricated dollar impact figures.** Every "estimated dollar impact" or "potential impact" figure in an anomaly must be arithmetically traceable to specific line items in the extracted result. If the impact figure cannot be reconstructed by summing specific line contributions, the anomaly does not ship.

**F5. Fabricated legislative citations.** Anomaly text may not cite legislation, program rules, or "Aged Care legislation" as authority unless the specific rule being invoked is present in the deterministic ruleset and points to a specific published source. Vague legislative appeals ("This is required under Aged Care legislation") are forbidden.

**Regression test for anti-hallucination:** For each real-world fixture (Margaret, and the archetype fixtures listed above), decode and inspect the anomaly list. For every anomaly raised, the specific field cited in the anomaly text must be present in the source. For Margaret specifically: source contains zero instances of "GST"; therefore the decoded output must contain zero GST-related anomalies. A decoder that raises a GST anomaly on Margaret's fixture fails this regression test regardless of the severity level assigned.

**Rationale.** Wayly's users are families making real decisions about aged care. A hallucinated compliance issue puts them in a confrontation with their provider over money that was never charged. The trust cost of a single fabricated anomaly acted on exceeds the aggregate benefit of many correct anomalies. Fabrication is not a bug on a spectrum with false-positive tuning; it is a distinct class of failure that must be architecturally prevented, not filtered.

## Phase 0: Audit First

Deliverable: markdown report in the repository. Do not change behaviour.

Beyond the earlier Phase 0 items (route mapping, date parsers, code fabrication sites, government-paid definitions, anomaly rule inventory, determinism verification, persistence path, render code, layout, contrast), this phase adds:

- **Unit handling.** Locate the line-item schema. Confirm whether a `unit` field exists. If it does, list the accepted values. If it does not, plan its introduction.
- **Per-line contribution generation.** Find where per-line contribution and government-paid values are produced. Confirm whether they are extracted from the source or synthesised. If synthesised, quote the code that does it and identify the split rule.
- **Care management extraction.** Find where the care management amount is captured. Confirm it is extracted from the source rather than computed as `10% * services_total`.
- **Source arithmetic reconciliation.** Confirm whether any deterministic rule compares the sum of line item Amount values against the source's declared services total. If not, plan the rule.
- **Line-item order preservation.** Locate the extraction path and identify any sort operation applied to line items after extraction.
- **Short-form date handling.** Test the extraction path with a short-form DD date, `02/06`, in a source where the period header states June 2026. Confirm the behaviour.
- **Statement pathway shapes.** Identify which of the following the current schema supports and which are unsupported: Ongoing SAH, Restorative Care Pathway, End-of-Life Pathway, AT-HM standalone, zero-service months, interim funding at 60%, financial hardship supplement, HCP legacy fields.

## Phase 1: Consolidate

Same as DEC-1 v3 Phase 1 (one decode core, one severity taxonomy, one persistence store, one render pipeline per surface), plus:

- Line-item schema gains a mandatory `unit` field with the enumerated vocabulary above. Add `raw_qty_text` and `raw_rate_text` fields to preserve the exact source text for downstream verification.
- Per-line contribution and government-paid fields become nullable in the schema.
- Add a `source_declared_services_total` field distinct from `computed_line_item_sum`. Both are stored.
- Add `care_management` as a top-level field, not a line item, unless the source explicitly presents it as a line item. Store its source text alongside.
- Add cadence context on the funding field. A monthly statement carries `funding_available_this_month`; a quarterly statement carries `quarterly_allocation`. Do not overload one field.

## Phase 2: Fix the Named Defects

1. **Date parser flexibility.** Accept the six formats listed in the Real-World Anatomy section. Short-form DD or DD/MM dates resolve using the statement period's year and month range. Parse failures raise visibly.
2. **Unit vocabulary.** Add the `unit` field. When extracting a line item, capture the unit from the quantity or rate cell. When the rate is written as `$1.20/km`, extract unit as `km`. When quantity is written as `1 session`, extract unit as `session`. Store raw text alongside.
3. **No fabricated per-line values.** When the source provides only aggregate contribution and government-paid figures, the extraction step produces null per-line values. The renderer shows blank in those columns and displays the aggregate figures in the summary panel. Do not apply a per-line percentage rule.
4. **Care management extracted, not assumed.** Read the care management amount from the source's care management section or line. Compare against 10% of the extracted services total and flag as follows: within 0.5% of 10% is silent; more than 1% below 10% is INFO; more than 1% above 10% is HIGH. Do not overwrite the source value.
5. **Source arithmetic reconciliation rule.** Sum the Amount column and compare to the declared services total from the summary section. Any gap over $0.00 raises a MEDIUM anomaly with the discrepancy amount as the impact figure.
6. **Preserve source order.** Do not sort line items after extraction. If a re-sort is needed for a specific view, do it in the renderer with the source order preserved in the underlying record.
7. **Zero-service months.** Recognise and handle. Do not raise an anomaly for zero line items on a monthly statement. Continue to require summary panel figures (opening balance, closing balance, funding available).
8. **Funding field cadence context.** On a monthly statement, the funding field is labelled "Funding available this month" and stores the monthly figure. On a quarterly statement, it is "Quarterly allocation" and stores the quarterly figure. Do not label a monthly figure as quarterly.
9. **All previous v3 fixes retained.** No 1970 collapse. No MM/DD misread. No invented service codes. No recurring-service false positives. No empty-ABN false positives (deterministic ABN check for malformed only). Persistence unified. PDF parity. Table layout. Contrast on teal surfaces. Determinism gate.

## Phase 3: Regression Gate

Add automated tests that run each fixture through both routes and assert byte-identical structured result and anomaly list. Add the following fixtures to the regression suite:

### Existing fixtures (retain from DEC-1 v3)
- S1 through S4 (quarterly Louisa Davids)
- M1 through M3 (monthly Louisa Davids)

### New fixture: MARGARET_June_2026 (see appendix)

The critical real-world test case. Fixture and golden values are produced by `build_margaret_v1.py` in the same self-verifying builder pattern.

Assertions for Margaret:
- Participant Margaret Wilson, provider Better Care at Home Services Pty Ltd
- Period 2026-06-01 to 2026-06-30, cadence monthly, not flagged
- 16 service lines extracted, all with dates (short-form dates resolved), all in June 2026
- Line item units: `hr` (12 rows), `km` (2 rows), `session` (1 row), `hr` (1 row) — full breakdown in the fixture builder
- Line 3: Transport, 18 km at $1.20/km, total $21.60 — must render "km" not "hours"
- Line 11: Physiotherapy, 1 session at $185.00, total $185.00 — must render "session" not "hours"
- Line 15: Transport, 22 km at $1.20/km, total $26.40
- Per-line contribution and government-paid columns: null (blank in UI)
- Aggregate participant contribution $197.25 in summary panel
- Aggregate government paid $1,775.25 in summary panel
- Monthly funding available $3,250.00, closing balance $1,277.50
- Care management fee $142.50, extracted from source, not assumed
- MEDIUM anomaly raised for source arithmetic gap: declared services total $1,972.50 vs sum of line items $1,951.00, gap $21.50
- INFO anomaly raised for care management below 10% (7.22%)
- INFO anomaly raised for pension status unknown
- Total anomaly count: 3

### Additional archetype fixtures to add

Emergent should also build fixtures covering the following archetypes. Each is a real-world shape Wayly must handle:

- **Zero-service month.** Statement issued for a month with no services delivered. Golden: 0 line items, valid summary panel, no anomalies beyond pension-status info.
- **Full-pensioner "no worse off".** All contributions across all categories are $0.00, including everyday living. Golden: no participant contribution anomaly, aggregate matches.
- **Post-1 October 2026 personal care.** Personal care line items show $0.00 participant contribution. Golden: not flagged as anomalous. This is the post-reform state.
- **Restorative Care Pathway.** Separate funding envelope alongside ongoing SAH, 16-week window. Golden: two funding streams recognised, expiry date extracted.
- **AT-HM standalone.** No ongoing SAH funding, only AT-HM items with 12-month validity. Golden: committed-but-not-delivered figures extracted, expiry dates preserved.
- **Interim funding at 60%.** Funding line shows 60% of full classification amount with note. Golden: interim state recognised, not flagged as under-funded.
- **Adjustments from prior month.** Line labelled "Adjustment — May 2026 correction" with a negative amount. Golden: not flagged as anomalous, treated as a legitimate reconciliation entry.
- **Provider terminology variations.** One fixture where categories are labelled "Nursing & allied health" / "Independent living" / "Domestic supports" instead of the standard three. Golden: correctly categorised.

The determinism gate applies to every fixture. Each is decoded three times and byte-identical results are required.

## Golden Output: Margaret June 2026

See `build_margaret_v1.py` for the source. Key expected values:

- Line items: **16**
- Line item unit breakdown: 13× `hr`, 2× `km`, 1× `session`
- Sum of line items: **$1,951.00**
- Declared services total: **$1,972.50**
- Arithmetic gap: **$21.50** (flag MEDIUM)
- Participant contribution: **$197.25** (aggregate only)
- Government paid: **$1,775.25** (aggregate only)
- Care management: **$142.50** (7.22% of declared, flag INFO)
- Monthly funding available: **$3,250.00**
- Closing balance: **$1,277.50**
- Aggregate identity holds: **$197.25 + $1,775.25 = $1,972.50** (matches declared, not sum)
- Anomalies: exactly 3 (arithmetic gap MEDIUM, care mgmt below 10% INFO, pension unknown INFO)
- No per-line contribution values fabricated
- No dates blanked
- No units flattened

## Open Items (confirm before merge)

1. **Care management below 10% behaviour.** The recommendation is INFO for below-10% and HIGH for above-10%. Confirm whether below-10% should be silent instead. Argument for silent: providers may deliberately discount. Argument for INFO: users deserve to know their fee is below the industry standard when it varies.
2. **Aggregate identity mismatch handling.** When the source's own aggregate participant + government paid does not equal declared services total, flag at what severity? Recommendation MEDIUM.
3. **Post-1 October 2026 personal care detection.** How does the decoder know a statement is post-reform? By period date, by provider representation, or by presence of a $0.00 contribution on a personal care line? Recommendation: date-based first, presence-based as fallback with a note.
4. **HCP legacy field detection.** When a statement carries residual Home Care Package fields during transition, should these be extracted, ignored, or flagged? Recommendation: extract into a separate `legacy_hcp` section on the record, do not merge into current SAH fields, do not flag.
5. **Line item ordering when source is not chronological.** Some provider software groups by category rather than by date. Preserve source order (recommended) or reorder to chronological?

## Out of Scope

- No new anomaly types beyond those needed to satisfy the invariants.
- No changes to billing, Stripe, or any figure sourced from legislation. Those stay PENDING.
- No visual redesign beyond the specific table layout, unit rendering, contrast, and column blank-cell fixes named here.
- No "Wayly Confidence" chip. That decision stands from prior discussions.

## Appendix: Margaret Fixture Builder

The file `build_margaret_v1.py` produces `MARGARET_June_2026.pdf` and prints the golden output. All invariants are enforced at build time. If any is violated, the build fails with a named error and no PDF is produced. The fixture matches the real statement shape observed in production and includes:

- Short-form DD/MM dates (year inferred from period)
- Mixed units: hr, km, session
- Aggregate-only contribution and government paid
- Intentional $21.50 arithmetic gap between line sum and declared total (matching real source defect)
- Care management at 7.22%, not 10%
- No service codes
- No ABN on provider (absent-ABN is silent per DEC-1 v7.7 filter)
- No Aged Care Act footer reference (matches real statement)

The fixture is the acceptance test. If Emergent's decoder does not return the golden values for Margaret when the fixture is uploaded, the build does not pass.

