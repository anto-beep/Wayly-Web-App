# Audit — Items 1a, 3a, 9a — Verification against official DoH PDFs

**Date:** February 2026
**Source documents:** uploaded by user
1. Department of Health, "Schedule of Subsidies and Supplements for Support at Home" — effective 1 November 2025.
2. Aged Care Rules 2025 (relevant: ss.193-5, 194-5/229-5, 238-5, 196-15/20/25/30/35).
3. "Support at Home program — participant contributions" — effective 1 November 2025.
4. "Summary of indicative Support at Home prices" — October 2025.
5. "Support at Home program — self-management."
6. "Support at Home program — services."
7. "Support at Home service list."

---

## Item 1a — Part Age Pension contribution bands

### Finding
Our code previously hard-coded `part_age_pension` as Independence **5%-25%** / Everyday Living **17.5%-25%**. The official DoH PDF "participant contributions" (effective 1 November 2025) treats **Part Pensioner AND CSHC as the same cohort with the same band**:

| Pension status | Clinical | Independence | Everyday Living |
|----------------|----------|--------------|-----------------|
| Full pensioner | 0% | 5% (exact) | 17.5% (exact) |
| **Part pensioner OR CSHC** | 0% | **5% – 50%** | **17.5% – 80%** |
| Self-funded | 0% | 50% (exact) | 80% (exact) |

(The 0%–25% bands cited in the brief are the *No Worse Off* cohort, not standard part pension.)

### Fix applied
- `backend/agents.py:_PENSION_RATES["part_age_pension"]` updated to `Independence (0.05, 0.50)` / `EverydayLiving (0.175, 0.80)` to match CSHC and the PDF.
- `backend/lib/tool_helpers.py:PENSION_RATES["part"]` mirrored.
- `backend/tests/test_pension_rates.py` updated: the regression test that flagged 30% as out-of-band now uses 60% (60% IS outside the new 5%-50% band, 30% IS NOT). All assertions about the band citation updated to "5%-50%".
- `backend/tests/test_anomaly_persistence.py` headline copy updated.

---

## Item 3a — Rollover cap base

### Finding
Section 193-5 of the Aged Care Rules 2025 references the "base individual amount" defined in s.229-5:

| SAH class | s.229-5 base individual daily | Schedule of Subsidies daily total | Ratio |
|-----------|--------------------------------|------------------------------------|-------|
| 1 | $26.46 | $29.40 | 0.900 |
| 2 | $39.54 | $43.93 | 0.900 |
| 3 | $54.16 | $60.18 | 0.900 |
| 4 | $73.22 | $81.36 | 0.900 |
| 5 | $97.88 | $108.76 | 0.900 |
| 6 | $118.64 | $131.82 | 0.900 |
| 7 | $143.38 | $159.31 | 0.900 |
| 8 | $192.59 | $213.99 | 0.900 |

So `base_individual_amount = daily_total × 0.9`. The remaining 10% (the `base_provider_amount` defined in s.238-5) is the provider's admin slice — **not** the care-management deduction.

s.193-5 computes the quarterly rollover credit against the base individual amount, which equals `annual_gross / 4 × 0.9`. Our `quarterly_budget()` already returns exactly that figure. **The existing maths is correct.**

The brief's item 3a ("use gross annual / 4 instead of post-care-management") appears to conflate the provider's 10% (already excluded from the base individual amount) with the participant's care-management 10% (a separate deduction taken from the base individual amount each quarter for ongoing-service participants).

### Fix applied
- No maths change. Code was already correct.
- `backend/budget.py:quarterly_budget()` docstring rewritten to make clear it returns the **base individual quarterly amount** (the legacy "post care management" label was misleading).
- `backend/budget.py:rollover_cap()` docstring rewritten to cite s.193-5 + s.229-5 + the Schedule of Subsidies PDF, with a worked SAH 8 example ($1,757.39).

---

## Item 9a — Classification annual budgets

### Finding
The Schedule of Subsidies and Supplements PDF (effective 1 November 2025) prints the following daily totals:

| Class | PDF daily total | Our seed `daily_total` | Annual (×365) | Our seed annual | Match? |
|-------|-----------------|------------------------|----------------|-----------------|--------|
| 1 | $29.40 | 29.40 | 10,731.00 | 10,731 | ✅ |
| 2 | $43.93 | 43.93 | 16,034.45 → 16,034 | 16,034 | ✅ |
| 3 | $60.18 | 60.18 | 21,965.70 → 21,966 | 21,966 | ✅ |
| 4 | $81.36 | 81.36 | 29,696.40 → 29,696 | 29,696 | ✅ |
| 5 | $108.76 | 108.76 | 39,697.40 → 39,697 | 39,697 | ✅ |
| 6 | $131.82 | 131.82 | 48,114.30 → 48,114 | 48,114 | ✅ |
| 7 | $159.31 | 159.31 | 58,148.15 → 58,148 | 58,148 | ✅ |
| 8 | $213.99 | 213.99 | 78,106.35 → 78,106 | 78,106 | ✅ |

**Our seed values (in `seed_program_reference.py`) are 100% correct against the source PDF.**

The ~$1,949/year Level 6 discrepancy F3 flagged was traced to the **stale legacy fallback dict** in `batch2_routes.py:_DEFAULT_MEANS_TEST.subsidy_by_classification`, which was carrying pre-F3 figures (`L2: 15910 / L3: 22515 / L5: 39805 / L6: 49906 / L7: 60005`). Runtime overlays the seed values via `_load_means_test_settings()` so production was always using the correct figures, but the fallback was a landmine.

### Fix applied
- `backend/batch2_routes.py:_DEFAULT_MEANS_TEST.subsidy_by_classification` synced to the PDF-verified figures `{1:10731, 2:16034, 3:21966, 4:29696, 5:39697, 6:48114, 7:58148, 8:78106}` with a comment pointing at this audit doc.

### Already correct in seed
Spot-checked: Transitional HCP daily totals (L1: $30.10, L2: $52.93, L3: $115.22, L4: $174.68), RCP ($53.67/day, $6,000 episode), End-of-Life Pathway ($298.04/day, $25,000), AT-HM tiers (Low $500 / Medium $2,000 / High $15,000), Assistance Dog ($2,000), supplements (Oxygen $14.66, Enteral bolus $23.25, non-bolus $26.11, Veterans' 11.5%, Dementia & Cognition 11.5%, EACHD $3.45, Care Management $3.95) — all match the PDF.

### Outstanding
- **No post-1-July-2026 indexed figures** are published in the Schedule yet (PDF only shows the 1 Nov 2025 rates). The Schedule notes indexation events on 20 March and 20 September each year — the next indexation (20 March 2026) is already seeded for the lifetime caps. Per-classification indexation rows will need to be added once DoH publishes them.

---

## How the other PDFs are useful

| PDF | Use |
|-----|-----|
| **Aged Care Rules** | Authoritative source for s.193-5 (rollover), s.229-5 (base individual amounts), s.238-5 (base provider), s.196-15/20/25/30/35 (supplements). Citation source for code comments and the audit log. |
| **Schedule of Subsidies and Supplements** | The single source of truth for per-class daily totals, supplements, RCP/End-of-Life Pathway daily, AT-HM tiers, Assistance Dog. Used to verify item 9a end-to-end. |
| **Participant Contributions** | Source for the contribution-rate table (item 1a). Confirms part-pension and CSHC share the same band. Confirms the No-Worse-Off cohort (0/0/0, 0–25/0–25, 25/25). Confirms the lifetime caps ($135,318.69 standard / $84,571.66 grandfathered) and the 20 March/20 September indexation schedule. |
| **Indicative Prices (October 2025)** | Median + range AUD prices per service (Nursing $150/hr, Personal care $100/hr, Domestic assistance $95/hr, Transport $70/trip, Meal delivery $15, etc.). **Not yet seeded** — recommend adding as `indicative_price.{service}` reference rows so the Statement Decoder and Price Checker have a brand-aligned median to compare against. |
| **Services (2-page summary)** | Lays out the three streams (Clinical / Independence / Everyday Living) and confirms the personal-care → Independence assignment (the "moves to Clinical on 1 October 2026" rule we already encode in Care Plan Reviewer's stream_alignment check). |
| **Service List (detailed)** | Comprehensive in-scope/out-of-scope list per stream — used by Care Plan Reviewer's `service_list` check (Rule 3 in the decoder). Useful to expand the regex/dictionary that classifies novel service names. |
| **Self-Management** | Confirms the **mandatory 10% care-management deduction** for ongoing-service participants (cited in s.205-15). Confirms the **10% cap on provider overhead for third-party services** when self-managing. Used to keep `care_management.cap_pct = 0.10` in seed and to copy the self-managed third-party overhead rule into the Care Plan Reviewer. |

---

## Status summary after this PR

| Item | Status |
|------|--------|
| 1a — Part pension bands | ✅ Now matches the DoH PDF (5%–50% / 17.5%–80%). |
| 3a — Rollover cap | ✅ Code was already correct against s.193-5 + s.229-5 + the Schedule PDF. Docstrings clarified. |
| 9a — Classification figures | ✅ Seed verified against the Schedule PDF. Legacy fallback synced. Post-1-July-2026 figures intentionally NOT seeded — DoH advice (Feb 2026) is that providers will continue to set their own prices until further notice. |
| 9a — Indicative prices | ✅ All 27 services from the October 2025 DoH "Summary of indicative Support at Home prices" PDF seeded into program_reference + wired into `PRICE_BENCHMARKS`. Price-check endpoint now returns the official median, lower, upper, unit and stream. Regression suite `tests/test_indicative_prices.py` locks in the medians for 12 spot-checked services across all three streams plus all 6 legacy hyphenated aliases. |
