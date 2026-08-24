# INDEX-1 v1 — Phase 0 Audit Report

**Audit date:** Feb 2026
**Auditor:** E1 (Emergent agent)
**Blocking gate:** yes. Phase 1 registry + loader migration cannot start until Antony confirms the five open items in Section 8 of the spec.

---

## 0.1 Enumeration of every monetary constant

Source of truth in the codebase today: `backend/seed_program_reference.py`. Every value below is read at runtime via `program_reference.get_value(key, as_of=…)` — no direct Python literal is consumed by budget/decoder logic. The seed itself is a hard-coded `SEED_ROWS` list that writes to Mongo at first boot.

### 0.1.1 Classification daily rates + annual figures (SAH ongoing, sections 194-5 + 238-5)

| Constant key | Value | Effective | Source citation | Indexed? |
|---|---|---|---|---|
| `classification.1.daily_base_individual` | $26.46 | 2025-11-01 | DoH Schedule of Subsidies and Supplements, 1 Nov 2025 | Not on the standard indexation cycle (set at commencement) |
| `classification.2.daily_base_individual` | $41.32 | 2025-11-01 | Same | " |
| `classification.3.daily_base_individual` | $56.60 | 2025-11-01 | Same | " |
| `classification.4.daily_base_individual` | $76.52 | 2025-11-01 | Same | " |
| `classification.5.daily_base_individual` | $102.30 | 2025-11-01 | Same | " |
| `classification.6.daily_base_individual` | $124.00 | 2025-11-01 | Same | " |
| `classification.7.daily_base_individual` | $149.85 | 2025-11-01 | Same | " |
| `classification.8.daily_base_individual` | $201.29 | 2025-11-01 | Same | " |
| `classification_annual.{1..8}` | (annualised = daily × 365 × 0.9 for base individual portion; or annual gross = daily × 365) | 2025-11-01 | derived from above | " |

### 0.1.2 Lifetime caps (indexed twice yearly)

Already resolved by BUD-1 Phase 1 Rev A. Both pre-March-2026 and post-March-2026 values seeded with `effective_from`/`effective_to` ranges.

| Constant key | Value (current) | Value (previous) | Indexation |
|---|---|---|---|
| `lifetime_cap.standard` | $137,917.01 (from 2026-03-20) | $135,318.69 (2025-09-20 → 2026-03-19) | 20 Mar + 20 Sep |
| `lifetime_cap.no_worse_off` | $86,185.23 (from 2026-03-20) | $84,571.66 (2025-09-20 → 2026-03-19) | 20 Mar + 20 Sep |

### 0.1.3 Care management + rollover parameters

| Constant key | Value | Notes |
|---|---|---|
| `care_management.cap_pct` | 0.10 | s.198-5, universal across SAH + HCP transitional |
| `rollover.floor_aud` | $1,000 | s.193-5 |
| `rollover.pct` | 0.10 | s.193-5 |

### 0.1.4 Supplements (participant-side)

| Constant key | Value | Notes |
|---|---|---|
| `supplement.oxygen.daily_aud` | $14.66 | s.196-15 |
| `supplement.enteral_bolus.daily_aud` | $23.25 | s.196-20 |
| `supplement.enteral_non_bolus.daily_aud` | $26.11 | s.196-20 |
| `supplement.veterans.pct_of_base_individual` | 11.5 | s.196-30 |
| `supplement.dementia_cognition.pct_of_base_individual` | 11.5 | s.196-35 (grandfathered only) |
| `supplement.dementia_cognition.grandfathered_only` | true | Flag |
| `supplement.eachd_top_up.daily_aud` | $3.45 | Grandfathered only |
| `supplement.eachd_top_up.grandfathered_only` | true | Flag |

### 0.1.5 Stream proportions (used for indicative allocations)

| Constant key | Value | Notes |
|---|---|---|
| `stream_proportion.Clinical` | 0.40 | Program average |
| `stream_proportion.Independence` | 0.35 | Program average |
| `stream_proportion.Everyday Living` | 0.25 | Program average |

### 0.1.6 Transitional HCP daily rates

Rows `transitional_hcp.{1..4}.daily_base_individual` — same shape as SAH classes 1-4 but from the HCP transitional table (s.194-5(3)). Confirmed present in the seed.

### 0.1.7 Contribution rate percentages (four cohorts)

| Constant | Value | Cohort |
|---|---|---|
| `contribution_rate.full_pensioner.independence_pct` | 5% | s.196-5(2) |
| `contribution_rate.full_pensioner.everyday_pct` | 17.5% | Same |
| `contribution_rate.part_pensioner.independence_pct` | 5% | Same |
| `contribution_rate.part_pensioner.everyday_pct` | 17.5% (indicative — actual varies by pension percentage) | Same |
| `contribution_rate.cshc.independence_pct` | 50% | Same |
| `contribution_rate.cshc.everyday_pct` | 80% | Same |
| `contribution_rate.self_funded.independence_pct` | 50% | Same |
| `contribution_rate.self_funded.everyday_pct` | 80% | Same |

### 0.1.8 AT-HM (Assistive Technology + Home Modifications) tier caps

Present in the seed as `at_hm.tier.{1..4}` etc. Referenced by the AT-HM tool.

### 0.1.9 Complete count

Approx **41 keyed constants** across the six categories above. This is well under the "around 30" the spec estimates because the classification breakdown alone contributes 16 keys (daily + annual × 8 classes) and the supplements adds another 10 (values + flags).

## 0.2 Downstream consumers

Every one of the constants above is read via `program_reference.get_value(key, as_of=…)`. The consumers today:

| Module | Consumes |
|---|---|
| `backend/budget.py` | classification annuals, care_management pct, rollover floor/pct, lifetime caps |
| `backend/server.py::public_budget_calc` | supplements list, transitional HCP dailies |
| `backend/server.py::public_contribution_estimator` | contribution rate cohorts |
| `backend/server.py::public_at_hm` | at_hm tiers |
| `backend/agents.py` (LLM prompts) | **HARD-CODED VALUES in prompts** — see 0.3 |
| `backend/scenario_engine/events.py` | lifetime caps for scenario burn simulations |
| `backend/lib/pdf_reports.py` | lifetime caps for PDF summary rendering |
| `backend/tests/fixtures/*.json` | lifetime cap literals in fixture data (test-only) |

### 0.3 LLM prompts with hardcoded monetary literals — **YES, this is the biggest INDEX-1 refactor cost**

`grep -n "\\$[0-9]" backend/agents.py`:

- L119-L133 · The parser system prompt lists supplement daily amounts inline: `Oxygen supplement ($14.66/day)`, `Enteral feeding ($23.25/day bolus, $26.11/day non-bolus)`, `Veterans' supplement (11.5% of base individual daily)`, `Dementia and cognition supplement (11.5% base individual)`, `EACHD top-up ($3.45/day)`.
- The parser + audit prompts also reference `$1,000 rollover floor` and `$84,571.66 grandfathered cap` (**stale** — needs Rev A update to $86,185.23) in a handful of anomaly rules.
- `agents.py::PARSER_SYSTEM` (BUD-1 v1 patched already for em-dash rules): no lifetime cap in the prompt, but the supplements list is hard-coded.

**Impact:** any INDEX-1 registry migration must interpolate these values from the loader at build time. If Wayly does not yet have a prompt-template system, the shortest path is a `_render_prompt(prompt_key)` helper that substitutes `{lifetime_cap_standard}`, `{oxygen_daily}`, etc. and caches the result. Every module currently doing `system_message=PARSER_SYSTEM` becomes `system_message=render_prompt("parser_system")`.

### 0.4 Marketing / blog content

`grep -rn "\\$1[0-9][0-9],[0-9]" frontend/src/pages/marketing frontend/src/data`:

- `frontend/src/data/blog/*.mdx` — a handful of posts reference `$84,571.66` and `$135,318.69` verbatim (already stale after Rev A). Editorial QA needs to run to catch these.
- `frontend/src/pages/marketing/*` — hero copy and pricing pages reference figures. Spot-check needed.
- `frontend/src/pages/Landing.jsx` — no monetary literals in the current version (confirmed).

**Recommendation:** the marketing content is an editorial concern, not a runtime one. Blog authors continue to type `$137,917.01` inline; the MDX editorial QA script (if it exists, per the spec hint) should validate that any dollar figure over $100 appears in the current registry snapshot. If the script does not exist, that's a P2 build tool.

---

## Downstream consumer map

```
program_reference.get_value(key, as_of)
    ├── budget.py
    │      ├── classification_annual → server.py::public_budget_calc, scenario_engine
    │      ├── quarterly_budget      → server.py, PDF report renderer
    │      ├── rollover_cap          → server.py, decoder anomaly rules
    │      └── lifetime_cap          → server.py, scenario_engine, PDF report
    ├── server.py::public_contribution_estimator (contribution_rate.*)
    ├── server.py::public_at_hm (at_hm.tier.*)
    ├── agents.py PARSER_SYSTEM & AUDIT_SYSTEM (STILL HARD-CODED DOLLAR STRINGS)
    ├── lib/pdf_reports.py (renders lifetime cap into PDF summary)
    └── scenario_engine/events.py (simulates burn against lifetime cap)
```

---

## Summary of Phase 0 findings + recommendations

| Finding | Status | Blocker? |
|---|---|---|
| Every monetary value already reads via `get_value` in the code path | ✅ No refactor cost for the calc/decoder consumers | No |
| LLM prompt strings hard-code dollar amounts inline | ⚠️ Non-trivial refactor — needs a prompt-template mechanism | Recommend adding a `render_prompt(key)` helper in Phase 1 |
| Marketing / blog content contains dollar literals | 🟡 Editorial-QA problem, not runtime | Not for Phase 1 |
| Cross-workstream indexation review process | ❌ No process today. This is the whole point of INDEX-1. | The lack of the process is exactly what INDEX-1 fixes |
| Migration to YAML registry | ✅ SEED_ROWS is 1-1 mappable to `monetary_constants.yaml` structure | No blocker |
| `MonetaryConstant` Pydantic model needs `Decimal` for accuracy | ✅ Standard | No blocker |
| CI job schedule (Sydney tz) | ⚠️ Depends on GH Actions cron support (yes it's supported) | No blocker |
| Retention of history block per constant | ✅ Already implicit via `effective_to` in the seed | Confirm indefinite retention (spec §8 Open Item 3) |

## Open items requiring Antony's confirmation (spec §8 recap)

1. **Reviewer identity** — Antony personally, or delegated? Goes into `last_verified_by`.
2. **Alert channel** — GitHub issue + email? Or GitHub issue only? **My recommendation:** GH issue + email for compliance record-keeping.
3. **History retention** — indefinite (audit trail). **My recommendation:** yes, indefinite.
4. **Contribution rate percentages location** — same registry with `unit: "percentage"` (my recommendation), or a separate `contribution_rates.yaml`?
5. **1 October 2026 personal care funding change** — is this a scheduled-change entry in the same registry, or a separate `scheduled_changes.yaml`? **My recommendation:** same registry with `next_scheduled_change` metadata alongside `next_review_due`; simpler operationally.

## Recommended Phase 1 delivery order (rollout plan echoed for record)

1. **Deploy 1** — introduce `backend/data/monetary_constants.yaml` + `backend/monetary_constants.py` loader. `seed_program_reference.py` becomes a thin wrapper delegating to the registry. **No behavioural change.** Add `test_registry_loads_without_error` and `test_all_constants_have_source_urls`.
2. **Deploy 2** — Refactor `agents.py` `PARSER_SYSTEM` / `AUDIT_SYSTEM` prompts to use a `render_prompt` helper that substitutes dollar amounts from the registry. Verify identical decoded output on 3 real statement fixtures before and after.
3. **Deploy 3** — Add `.github/workflows/check-monetary-drift.yml` + `backend/data/drift_check_rules.yaml`. Test with a deliberately stale value.

---

**Phase 0 gate: audit complete. Awaiting Antony's confirmation on the five open items above before starting Deploy 1.**
