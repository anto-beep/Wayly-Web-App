# DEC-1 v5 — Phase 0 Audit

**Deliverable status:** Phase 0 audit as required by DEC-1 v5 §Phase 0. No behaviour changes made. Awaiting owner sign-off before Phase 1.

**Spec source:** `/app/docs/DEC-1_v5_spec.md`
**Fixture builder:** `/app/backend/tests/fixtures/build_margaret_v1.py`
**Fixture PDF:** `/app/backend/tests/fixtures/MARGARET_June_2026.pdf`
**Fixture run date:** 8 July 2026, statement id `dd6fd5bb-89b7-40f7-855c-3510837b0410` (household cathy@example.com)

---

## 1. Observed defects on the real fixture

Margaret Wilson, Better Care at Home Services Pty Ltd, June 2026 was uploaded through the authenticated `/api/statements/upload` route (same code path as `/api/public/decode-statement`). The following defects were observed vs the golden output in `build_margaret_v1.py`:

| # | Golden expectation | Current decoder output | Severity |
|---|---|---|---|
| 1 | 16 line items in source order | **21 line items** — 5 lines duplicated with once-short (`02/06`) and once-full (`02/06/2026`) dates | HIGH |
| 2 | All 16 rows carry June 2026 dates | Short-form dates NOT resolved to full form; both short + full versions coexist | HIGH |
| 3 | Unit vocabulary `hr` / `km` / `session` preserved | `unit` field is empty (`""`) for every line; `km` and `session` values silently discarded | HIGH |
| 4 | Quantity extracted (e.g. 18 km, 1 session, 2.0 hr) | `hours` = `null` for every line; `quantity` field does not exist in schema | HIGH |
| 5 | Per-line `participant_contribution` / `government_paid` = `null` | Fabricated on every row (e.g. transport 18 km line shows `pc=0.0, gp=21.6`) | HIGH |
| 6 | `care_management_rate_pct` = 7.22% | `care_management_rate_pct` = 0.0 | MEDIUM |
| 7 | MEDIUM anomaly for $21.50 arithmetic gap | Anomalies emitted (3 total) but rule keys empty — no explicit `RULE_25` or arithmetic-gap flag | MEDIUM |
| 8 | INFO anomaly for care mgmt below 10% | Not flagged | LOW |
| 9 | Anomaly count exactly 3 (arith gap + care mgmt below 10% + pension unknown) | 3 anomalies but not the specified three; rules unlabelled | MEDIUM |

Additional invariant violations:
- `total_gross` / `total_participant_contribution` / `total_government_paid` at the root of `extracted_json` all come back `null` (though the summary text mentions the correct aggregate numbers). Invariant M2 identity `gross_total = participant_contribution + government_paid` cannot be checked without these fields populated.

---

## 2. Schema audit

Current line-item schema (from `/app/backend/agents.py:299-315`):

```
{
  "date": "",
  "service_description": "",
  "service_code": "",
  "stream": "Clinical" | "Independence" | "EverydayLiving" | "ATHM" | "CareMgmt" | "supplement",
  "hours": 0.00,
  "unit_rate": 0.00,
  "gross": 0.00,
  "participant_contribution": 0.00,
  "government_paid": 0.00,
  ...
}
```

DEC-1 v4 requires (§Phase 1):

```
{
  "date": "2026-06-05",             # resolved to ISO, no short-form leakage
  "service_description": "...",
  "service_code": "",
  "stream": ...,
  "quantity": 18.0,                  # NEW — replaces implicit "hours"
  "unit": "km",                      # NEW — enumerated: hr|km|session|visit|ea|day
  "raw_qty_text": "18 km",           # NEW — preserves source verbatim
  "raw_rate_text": "$1.20/km",       # NEW — preserves source verbatim
  "unit_rate": 1.20,
  "gross": 21.60,
  "participant_contribution": null,  # nullable — no fabrication
  "government_paid": null,           # nullable — no fabrication
  ...
}
```

Missing top-level fields (extracted_json):
- `source_declared_services_total` — currently overloaded onto `reported_total_gross`, no distinct storage for the source's own printed subtotal separate from the computed line-item sum. Needed for the arithmetic-gap rule.
- `computed_line_item_sum` — currently derived on the fly; needs to be persisted alongside so the reconciliation rule is deterministic.
- `care_management_source_text` — the raw string the CM amount was read from, needed for evidence trail.
- `funding_available_this_month` (monthly) vs `quarterly_allocation` (quarterly) — currently overloaded on `quarterly_budget_total`, hiding cadence context.

---

## 3. Date parser audit

The current path handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and a handful of written variants (e.g. `2 June 2026`, `2-Jun-2026`). Short-form `DD/MM` **is not** resolved against the statement period header. Instead:

- The LLM extraction sometimes emits both variants side-by-side (as seen: 5 lines duplicated as `02/06` and `02/06/2026`).
- The downstream date normaliser silently accepts both.
- Result: 21 rows for a 16-row source.

**Root cause:** the LLM prompt (`agents.py:265-325`, the extraction schema block) does NOT instruct the model to resolve DD/MM using the period header, so it hedges by emitting both forms when the source displays short. The audit-line dedup in `agents.py` matches by (date, service_code, unit_rate) but treats `02/06` and `02/06/2026` as distinct dates.

**Fix location:** two changes required — (a) the LLM prompt must instruct short-form resolution using `period_start`/`period_end`; (b) a deterministic Python normaliser must post-process to a canonical ISO date, before dedup runs.

---

## 4. Unit-handling audit

Current storage: single `hours` field, no explicit `unit`. When the LLM sees `18 km`, `1 session`, `2 hr`, the prompt does not tell it what to do with the unit. In practice the model:
- Drops the km/session labels.
- Puts either the numeric qty or 0 into `hours`.
- Consumers (`DecoderResultView.jsx`, PDF export) render an "Hrs" column regardless.

Renderer references (frontend): `DecoderResultView.jsx` §line-item table uses an "Hrs" heading. Any transport row will display as `18 hours` unless the schema exposes a real unit.

**Fix location:** schema (Phase 1) + LLM prompt (Phase 2) + renderer column headings (Phase 2).

---

## 5. Per-line contribution generation audit

Grepped `agents.py` and `server.py` for any place that synthesises per-line contribution:

- `agents.py:1116` — inline extractor fallback that stores `unit_rate=amount` when the model returns nothing usable.
- `agents.py:2293` — RULE_9_CONTRIBUTION_MISMATCH: this is a check, not a synthesiser, but it iterates every line item expecting a non-null `participant_contribution`. Currently `.get('participant_contribution') or 0.0` is used everywhere, which forces `null` into `0.0`.
- `server.py:3494`, `3720` — post-audit reconciliation reads `care_management_deducted` and computes rate_pct, but this is orthogonal.

**Finding:** there is no single "apply-10%-per-line" function to remove. The fabrication happens implicitly:
1. The LLM prompt (agents.py:295 onwards) declares `participant_contribution: 0.00, government_paid: 0.00` in the schema JSON template as **default-non-null**, so the model emits synthetic values.
2. Downstream code (`or 0.0`) coerces missing values to 0, hiding the fact that the source didn't provide per-line splits.

**Fix location:**
- Make the schema template declare `participant_contribution: null, government_paid: null` and instruct the model: "If the source provides only aggregate figures, keep these null."
- Add a top-level flag `per_line_contribution_source: "aggregate_only" | "per_line" | "category_aggregated" | "percentage_labelled"` so downstream code (especially RULE_9) can skip the mismatch check when the source is aggregate-only.
- Update RULE_9 in `agents.py:2159-2328` to treat null per-line values as "not applicable", not "0".

---

## 6. Care management extraction audit

Current path: `agents.py:295` prompt asks the model to fill `care_management_deducted` from a dedicated CM section on the statement. Post-audit code at `server.py:3494` and `agents.py:1439` reads it and computes `care_management_rate_pct = care_management_deducted / monthly_gross_services * 100`.

On Margaret: `care_management_deducted = 142.50` was read correctly, but `monthly_gross_services` was null → division skipped → rate_pct = 0.0.

**Findings:**
- The value **is** extracted from source (invariant 13 satisfied on the read).
- The **rate check** silently no-ops when the denominator is null. There's no INFO/HIGH flag for below-10% or above-10%.
- The current default assumption ("care management is 10% of the fee base") is baked into `budget.py` `quarterly_budget()` but **not** into the anomaly detector.

**Fix location:** post-audit reconciliation (server.py ~L3494) — after computing rate_pct, emit `RULE_1B_CARE_MGMT_MONTHLY` at INFO when rate_pct is more than 1% below 10%, HIGH when more than 1% above 10%, silent within ±0.5%.

---

## 7. Source arithmetic reconciliation audit

Current path: `RULE_15_GROSS_TOTAL_PARSE_WARNING` (agents.py:701) fires only when the discrepancy between `reported_total_gross` and the sum of line items exceeds $5.00.

Margaret: gap is $21.50 — over the threshold — but the rule fires under **PARSE_WARNING** not as a MEDIUM source-defect anomaly, and only when both the reported total AND the line sum are populated. On Margaret, `reported_total_gross` came back null (the LLM stored it under a different key), so the rule didn't fire at all.

**Fix location:**
- New top-level field `source_declared_services_total` (populated from the statement's declared "Total services this month" or equivalent line).
- New deterministic rule `RULE_25_SOURCE_ARITHMETIC_GAP` at MEDIUM severity, `impact = |declared - line_sum|`, fires when gap > $0.00.
- Retire or narrow `RULE_15_GROSS_TOTAL_PARSE_WARNING` to only handle the parse-warning case (e.g., malformed number).

---

## 8. Line-item order audit

Searched `agents.py` and `server.py` for `.sort(` / `sorted(` on `line_items`:
- `agents.py:1116` — inline extractor fallback does NOT sort.
- `agents.py:1533` — care-mgmt line-items copied but preserving iteration order.
- No re-sort operations found.

**Finding:** source order is already preserved. Invariant satisfied.

However, the observed 21 rows on Margaret are NOT in Margaret's source order (they're grouped by short-form then full-form). This is a symptom of the duplicate extraction, not a sort bug. Fixing dedup (§3 above) resolves it.

---

## 9. Persistence & render audit

- **Persistence:** `db.statements` collection stores `extracted_json` (structured) + `audit_json` (anomalies) + `summary` (plain English). Same record read by `/api/statements/{id}` (detail view) and by the PDF/CSV renderer at `routes/statements.py:decoded.pdf`.
- **Renderer:** `DecoderResultView.jsx` and `routes/statements.py` `render_decoded_pdf` are the two rendering surfaces. Both currently assume `hours` and a single "Hrs" column.
- **Public decoder** (`/api/public/decode-statement` and its result view `DecoderResultView.jsx`) uses the SAME extraction path (`_submit_decode_job` in server.py:3820) as authenticated upload. No divergence. Invariant 1 (single compute source) satisfied at code level.

**Blocker for Phase 1:** the renderer changes (column header "Qty · Unit", per-line PC/GP columns rendering blank on aggregate-only statements) touch both React + Python renderers.

---

## 10. Cadence / zero-service / pathway audit

- Cadence inference lives at `agents.py:_infer_cadence` and treats 28-31 days as monthly. Margaret's 30-day period is inferred correctly. Invariant 10 satisfied.
- Zero-service months: no explicit branch. A statement with zero line items today would go through the anomaly detector and likely produce no anomalies beyond pension-status — which happens to be the correct behaviour. **Not tested end-to-end.**
- Restorative Care Pathway / End-of-Life Pathway / interim funding / adjustments / provider-terminology variations: **not supported** in the current schema. Placeholder fields `previous_period_adjustments`, `at_hm_commitments` exist but no path-specific top-level branching. These are Phase 3 archetype-fixture territory (see spec §"Additional archetype fixtures").

---

## 11. Recommended Phase 1 / 2 / 3 rollout

Given the scope and the spec's mandate for owner sign-off, I recommend the following staged rollout. Each phase is independently testable and independently reversible.

### Phase 1 (schema + storage, no behaviour change on existing statements)
- Add `quantity`, `unit`, `raw_qty_text`, `raw_rate_text` to the line-item schema. `hours` retained for backwards-compat, populated only when `unit == 'hr'`. Existing statements decoded before Phase 1 continue to render (backfill: `quantity = hours`, `unit = 'hr'`).
- Add `source_declared_services_total`, `computed_line_item_sum`, `care_management_source_text`, `per_line_contribution_source`, `funding_available_this_month` (monthly) / `quarterly_allocation` (quarterly) top-level fields.
- Make `participant_contribution` / `government_paid` on line items nullable at the storage layer.

### Phase 2 (extraction + anomaly rules)
- Update the LLM extraction prompt (`agents.py:265-325`) to:
  - Emit `unit` from a fixed vocab.
  - Resolve short-form dates against period header.
  - Leave per-line PC/GP null when the source is aggregate-only, and set `per_line_contribution_source` accordingly.
- Add deterministic `RULE_25_SOURCE_ARITHMETIC_GAP` (MEDIUM).
- Add deterministic `RULE_1B_CARE_MGMT_MONTHLY` INFO/HIGH thresholds around 10%.
- Update `RULE_9_CONTRIBUTION_MISMATCH` to skip when `per_line_contribution_source == 'aggregate_only'`.
- Rewrite Python date normaliser to produce ISO dates; run dedup on ISO date not raw string.
- Renderer changes: React table headers `Qty · Unit`; per-line PC/GP columns show blank when null; PDF renderer mirrored.

### Phase 3 (regression suite)
- Land the Margaret fixture: `tests/test_dec1_v4_margaret.py` decodes the fixture 3× and asserts byte-identical golden output.
- Backfill the additional archetype fixtures in §Phase 3 (zero-service, full-pensioner NWO, post-1-Oct-2026 personal care, RCP, AT-HM standalone, interim funding, adjustments, provider terminology).

---

## 12. Open items for owner sign-off (from spec §Open Items)

Before Phase 2, please confirm:

1. **Care management below 10% behaviour:** INFO or silent? Current recommendation in spec is INFO. Agent recommends INFO — users deserve to see when providers deviate from the industry standard.
2. **Aggregate identity mismatch (source's own participant + government ≠ declared total):** at what severity? Recommendation MEDIUM.
3. **Post-1-October-2026 personal care detection:** by period date, by provider representation, or by presence of $0.00 contribution? Recommendation date-based first, presence-based fallback with a note.
4. **HCP legacy fields during transition:** extract to a separate `legacy_hcp` section, or ignore? Recommendation extract, do not merge, do not flag.
5. **Line-item ordering when source is not chronological:** preserve source order (recommended) or reorder to chronological?

---

## 13. Effort estimate

- **Phase 1:** ~1 focused session (schema + storage + backfill, no behaviour change).
- **Phase 2:** ~2-3 focused sessions (LLM prompt rewrite is the risky bit; renderer changes across React + Python; RULE_25 + RULE_1B; RULE_9 skip logic).
- **Phase 3:** ~1 session for Margaret fixture + 3× determinism gate; additional archetype fixtures another ~2 sessions.

**Total:** ~5-7 focused sessions. Owner sign-off recommended between phases.

---

## 14. Anti-Hallucination Findings (v5 §F1-F5) — Margaret live decode

DEC-1 v5 adds five named fabrication patterns as **shipping-block** failures (Invariant 3 made concrete). The current decoder was scored against each on Margaret's live output:

| Pattern | Description | Current status on Margaret | Notes |
|---|---|---|---|
| **F1** — fabricated fields | No anomaly may reference a term or field not present in source | ⚠ **VIOLATED** — `RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH` fires with severity=medium despite header AND footer both showing `Better Care at Home Services Pty Ltd`. There is no mismatch to detect. | The rule needs a source-verification guard. |
| **F1 (GST sub-case)** | Zero "GST" mentions in source → zero GST-related anomalies | ✅ **PASS** — 0 GST mentions across summary and 3 anomalies. | Current decoder passes the GST-specific F1 test on Margaret, but only because Margaret has no other GST-adjacent triggers. Cannot be relied upon as a general architectural guarantee. |
| **F2** — fabricated per-line values | If aggregate-only, per-line PC/GP must stay null | ⚠ **VIOLATED** — every line has synthetic `pc` and `gp` (e.g. `pc=0.0, gp=21.6` on the transport row). See §5. | Same fix as v4 (nullable schema + prompt update). |
| **F3** — fabricated service codes | If source has no service codes, output must have none | ⚠ **VIOLATED** — decoder emitted `PT`, `PC`, `TR`, `SS`, `DA`, `MP`, `GD` on 21 rows. Source contains zero service codes. | The LLM prompt (agents.py:295-325 template) declares `service_code: ""` but the model still infers a "reasonable" code from the description. The prompt must forbid inference explicitly. |
| **F4** — fabricated dollar impact | Impact figures must be arithmetically traceable to line items | ⚠ **VIOLATED** — summary claims "roughly $433.00 is money that may be worth querying" but the 3 anomalies (`RULE_9`, `RULE_15`, `RULE_32`) have no per-flag `impact_aud`. The $433 is not reconstructable from any line-item subset. | Fix: every anomaly must carry `impact_aud`; the summary must derive its total by summing them. If impact is not derivable, omit it from the summary. |
| **F5** — fabricated legislative citations | No vague legislative appeals unless the rule points to a specific published source | ✅ **PASS** — quick grep of the 3 anomaly bodies shows no legislative citations at all. Note: this is a small sample; other statements may still show the pattern (spec calls out "Aged Care legislation" as a specific banned phrase). |

### Regression tests to add for v5 §Anti-Hallucination

1. **`test_margaret_no_gst_anomalies`** — decode Margaret, assert `sum(anom.lower().count('gst') for anom in anomalies) == 0`. Must ALSO check the summary text and the audit-log JSON.
2. **`test_margaret_no_fabricated_service_codes`** — decode Margaret, assert `all(li.get('service_code') in (None, '') for li in extracted_json['line_items'])`. Fixture source has no codes → structured result must have no codes.
3. **`test_margaret_no_provider_header_footer_mismatch`** — decode Margaret, assert `not any(a['rule'] == 'RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH' for a in anomalies)`. Fixture has identical header/footer → rule must not fire.
4. **`test_margaret_impact_is_traceable`** — decode Margaret, assert every anomaly with a non-null `impact_aud` has that figure equal to a specific line-item subset sum (`abs(impact - reconstructed) < 0.01`). Anomalies without impact_aud may exist but must not be summed into any summary figure.
5. **`test_no_vague_legislative_appeals`** — grep every anomaly body for the phrases `"Aged Care legislation"`, `"required under the Act"`, `"per the regulation"`; expect zero hits unless the anomaly's `rule` maps to a specific citation in the deterministic ruleset registry.

### Root-cause classification (v5 §Rationale)

Spec makes the point that **fabrication is not a filter-tuning problem** but a distinct architectural failure. Applying that lens to the current codebase:

- **F3 root cause:** the LLM is being asked to fill a permissive schema (`service_code: ""` default). The prompt does not say "leave empty if source is silent". This is an *architectural* issue — no amount of downstream stripping will guarantee correctness because the LLM can (and does) invent codes that pass a regex.
- **F4 root cause:** the summary generation pipeline currently *estimates* an aggregate impact from ambient signals (LLM-generated), rather than deriving from per-anomaly `impact_aud`. This is architectural — the summary trusts a computed number that has no traceable derivation.
- **F1 (RULE_32) root cause:** the rule fires from the LLM auditor (agents.py provider-mismatch prompt block), not from a deterministic Python check. LLM auditors do not consistently verify that the "mismatch" they claim actually exists in the source text. This is architectural — the rule needs to be moved to deterministic Python OR every LLM-emitted anomaly needs a `source_evidence` field that carries the exact substring the anomaly points to, and a deterministic post-check that fails the anomaly if the substring is absent from `raw_text_preview`.

### Recommended v5 architectural additions to Phase 1

Add these on top of the v4 Phase 1 schema changes:

- Every anomaly gains a required `source_evidence: List[str]` field — the specific substring(s) from the source that support the flag. Empty list → deterministic pre-persistence check strips the anomaly and logs a `HALLUCINATION_STRIPPED` event.
- Every anomaly gains a required `impact_aud: float | null` field. Summary generation derives totals ONLY from summed `impact_aud`. Null impact is allowed but does not contribute to any total.
- `LEGISLATIVE_CITATION_ALLOWLIST` in a new module — the only strings the auditor may output as legislative authority (e.g. "Aged Care Act 2024 s.194-5", "Support at Home Program Manual Chapter 17"). Any citation not on the allowlist is stripped before persistence.
- `SERVICE_CODE_ALLOWLIST` — if the source shows service codes at all (detected by regex on `raw_text_preview`), all extracted codes must be substrings of the source; if the source shows none, every line-item `service_code` must be empty or the extraction is rejected.

These additions make F1-F5 **architecturally enforced** rather than filter-tuned. They cost 1 extra day of engineering but eliminate an entire class of failure at merge time via CI.

