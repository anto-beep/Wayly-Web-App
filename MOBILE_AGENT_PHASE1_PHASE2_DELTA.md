# Wayly Mobile Agent — Phase 1 + Phase 2 Delta (Feb 2026)

This document brings the mobile app up to parity with the Wayly web app
after iterations 39–48. Mobile already auto-inherits every backend change
through the shared `/api/*` contract. This delta document covers:

1. **Two breaking API changes** — must fix before next mobile build.
2. **New optional payload fields** — additive; pick up when shipping the
   matching UI.
3. **New backend endpoints** — surface in the relevant screens.
4. **UI surfaces still to build on mobile** — with `data-testid` parity
   hints so the web's QA flows can be reused.

Backend reference: `/app/backend/server.py`, `/app/backend/agents.py`,
`/app/backend/seed_program_reference.py`, `/app/backend/program_reference.py`.
Web reference UIs: see `data-testid` selectors quoted in §4 below.

---

## 1. Breaking API changes (MUST FIX)

### 1.1 `quarterly_total` field removed

Endpoints affected:
- `POST /api/public/budget-calc`
- `GET /api/budget/current`

The deprecated `quarterly_total` alias was removed in iteration 48.

Replace any mobile read of `quarterly_total` with **`quarterly_usable`**.
Both endpoints also expose two new sibling figures the mobile dashboard
and Budget Calculator should display:

```jsonc
{
  "quarterly_gross": 7424.00,           // annual / 4 — the figure on provider statements
  "care_management_quarterly": 742.40,  // gross − usable (the 10% CM slice)
  "quarterly_usable": 6681.60,          // post-CM (what the participant can spend)
  // "quarterly_total": <REMOVED>       // ❌ no longer returned
}
```

Recommended mobile UI: a three-card layout — Gross → CM → Usable — for
both the Budget Calculator and the dashboard quarterly card. This matches
how the web renders it and lets families reconcile against the printed
provider statement.

### 1.2 Legacy `family-coordinator-chat` route removed

`POST /api/public/family-coordinator-chat` now returns `404` / `405`.

Replace it with `POST /api/public/aged-care-chat` (request/response shape
identical). The tool's user-facing name is now **Aged Care Q&A**, with
copy:

> Plain-English answers about the Support at Home program, grounded in
> the Aged Care Act 2024.

The new system prompt explicitly tells the model it has **no household
data**. If the user asks anything that needs their own statement / budget
("what is mum's budget?"), the assistant will redirect them to sign in
and use the in-app assistant. Surface that data boundary in the mobile
copy too — `"This is a general Q&A assistant — it can't see your account
or statements. Signed-in members can ask the in-app assistant questions
about their own household."`

---

## 2. New optional payload fields (additive)

All additive — mobile can ship without them and gradually add UI surfaces.

### 2.1 `POST /api/public/budget-calc`

```jsonc
{
  "classification": 4,
  "is_grandfathered": false,
  "current_lifetime_balance": 0,
  "expected_annual_burn": 0,

  // NEW (Phase 2 — Prompt J)
  "transitional_classification": 3,     // 1-4 only; force transitional HCP figures
                                        // regardless of is_grandfathered

  // NEW (Phase 2 — Prompt N)
  "applicable_supplements": ["oxygen", "veterans"]
  // valid keys: "oxygen", "enteral_bolus", "enteral_non_bolus",
  // "veterans", "dementia_cognition", "eachd_top_up"
  // ("care_management_provider" is silently filtered — it's provider-side)
}
```

Response gains:
```jsonc
{
  "is_transitional_hcp": true,
  "annual_supplements_total": 8424.31,
  "annual_total_with_supplements": 38120.31,
  "applied_supplements": [
    {"name": "oxygen",   "daily_aud": 14.66, "pct_of_base_individual": null, "annual_aud": 5350.90},
    {"name": "veterans", "daily_aud": null,  "pct_of_base_individual": 11.5, "annual_aud": 3073.41}
  ],
  "supplement_warnings": []  // populated when a tick is filtered out (provider-only / grandfathered-only)
}
```

Transitional HCP rule: when `is_grandfathered=true` and `classification ∈ {1,2,3,4}`,
the route auto-routes to the transitional figures (Aged Care Rules 2025
section 194-5(3)). Levels 5+ with `is_grandfathered=true` return HTTP 400
with a clear "only L1-L4 transitional figures exist" message — surface
that as a toast.

### 2.2 `POST /api/public/contribution-estimator`

```jsonc
{
  "classification": 4,
  "pension_status": "part",  // "full" | "part" | "cshc" | "self"  ← NEW: cshc accepted

  // NEW optional Services-Australia rates from the user's contribution letter
  "independence_rate_pct": 12.0,
  "everyday_rate_pct": 20.0
}
```

Response shape branches on `rate_basis`:
- `"exact_rate"` (full / self) — scalar `annual_contribution`, no low/high.
- `"user_supplied"` (part/cshc with user rates) — scalar values, no low/high.
- `"band_range"` (part/cshc without user rates) — `annual_contribution` is
  `null`; `annual_contribution_low/high` populated; `caveat` string set;
  per-stream `rate_pct` is `null` and `rate_pct_low`/`rate_pct_high` are set.

When `rate_basis === "band_range"`, surface a Services-Australia caveat
banner and the low–high range as `"$X,XXX–$Y,YYY"`. If the user supplies
an out-of-band rate (e.g. Independence 40% for a part-pension), the
backend returns HTTP 400 with a helpful message — show it inline.

### 2.3 `POST /api/public/care-plan-review`

```jsonc
{
  "text": "...care plan content...",

  // NEW optional context — improves the two arithmetic checks
  "classification": 4,
  "quarterly_budget": 7424.00
}
```

Response gains a **`checks`** array (always six entries in canonical
order):

```jsonc
{
  "summary": "...",
  "checks": [
    {"check": "budget_fit",           "status": "pass|flag|unknown", "note": "..."},
    {"check": "care_management_cap",  "status": "pass|flag|unknown", "note": "..."},
    {"check": "service_list",         "status": "pass|flag|unknown", "note": "..."},
    {"check": "stream_alignment",     "status": "pass|flag|unknown", "note": "..."},
    {"check": "review_date",          "status": "pass|flag|unknown", "note": "..."},
    {"check": "goals_alignment",      "status": "pass|flag|unknown", "note": "..."}
  ],
  "coverage": [...],
  "gaps": [...],
  "questions_to_raise": [...]
}
```

Render as a coloured-pill list — pass = sage, flag = terracotta,
unknown = amber.

### 2.4 `POST /api/public/reassessment-letter`

```jsonc
{
  "participant_name": "...",
  "current_classification": 4,
  "changes_summary": "...",
  "sender_name": "...",
  "relationship": "...",

  // NEW (Phase 1 — F13)
  "letter_type": "classification_reassessment | rcp_assessment | care_plan_amendment",

  // NEW — used only when letter_type === "rcp_assessment"
  "hospital_name": "Royal Melbourne Hospital",
  "discharge_date": "2026-02-10"
}
```

Response includes the matching `letter_type` so the UI can label the
generated letter correctly.

---

## 3. New backend endpoints

### 3.1 `GET /api/budget/eligible-pathways`  (auth required)

Returns short-term Aged Care pathways the household may qualify for,
based on signals harvested from recent statements + life-event fields.

Shape:
```jsonc
{
  "eligible": [
    {
      "pathway": "restorative_care",
      "title": "Restorative Care Pathway",
      "section_ref": "Aged Care Rules 2025, section 194-10(2)",
      "daily_aud": 53.67,
      "duration_days": 112,
      "episode_aud": 6000.00,
      "max_episodes": 2,
      "max_total_aud": 12000.00,
      "reason": "Recent hospital / mobility decline signal detected ...",
      "next_step": "/ai-tools/reassessment-letter?letter_type=rcp_assessment"
    }
  ],
  "evaluated_statements": 8,
  "evaluated_at": "2026-06-13T11:11:30.356774+00:00",
  "disclaimer": "Best-effort surfacing only. Actual eligibility ..."
}
```

Mobile: render as a dashboard card titled "Pathways the participant may
qualify for", one row per pathway, with the reason text + a primary CTA
that opens the Reassessment Letter screen pre-filled with
`letter_type=rcp_assessment` (Phase 1 — F13).

Empty list path is the common case — hide the card when
`eligible.length === 0`.

### 3.2 `GET /api/program-reference/public`  (already public, now richer)

`public_snapshot()` now exposes the full Aged Care Rules 2025 reference
bundle. New blocks:

```jsonc
{
  "pathways": {
    "restorative_care": {"daily_aud": 53.67, "duration_days": 112, "episode_aud": 6000, ...},
    "end_of_life":      {"daily_aud": 298.04, "duration_days": 84, "episode_aud": 25000}
  },
  "athm_tiers": {
    "tier": {
      "low":    {"amount_aud": 500.00},
      "medium": {"amount_aud": 2000.00},
      "high":   {"amount_aud": 15000.00, "amount_can_exceed": true, "one_per_lifetime": true}
    },
    "duration":          {"initial_months": 12, "extension_months": 12},
    "remote_supplement": {"pct": 50, "eligibility": "..."}
  },
  "assistance_dog_tier": {"amount_aud": 2000.00, "period_months": 12, "rollover": false},
  "supplements": {
    "oxygen":             {"daily_aud": 14.66, "eligibility": "...",   "grandfathered_only": false, "applies_to_provider": false},
    "enteral_bolus":      {"daily_aud": 23.25, ...},
    "enteral_non_bolus":  {"daily_aud": 26.11, ...},
    "veterans":           {"pct_of_base_individual": 11.5, ...},
    "dementia_cognition": {"pct_of_base_individual": 11.5, "grandfathered_only": true, ...},
    "eachd_top_up":       {"daily_aud": 3.45, "grandfathered_only": true, ...},
    "care_management_provider": {"daily_aud": 3.95, "applies_to_provider": true, ...}
  },
  "policy_status": {"price_caps": "deferred_indefinitely"},
  "policy_dates":  {"personal_care_free": "2026-10-01", ...}
}
```

Mobile already caches this snapshot for static reference values; just
pass through the new blocks. The Budget Calculator supplement picker
labels come from `supplements.<name>`.

---

## 4. UI surfaces still to build on mobile

Each surface lists the **web `data-testid` selectors** the QA harness
uses — mirror these (kebab-case) on mobile so the existing E2E plans
can be reused.

### 4.1 Statement Detail — anomaly card
- `anomalies-total-impact` — pill showing
  `"Potential impact: $X"` for `anomaly_dollar_impact_total`.
- Per row: `anomaly-<rule-or-id>`,
  `anomaly-dollar-<id>`, `anomaly-evidence-<id>` (expandable
  "Why was this flagged?" with the `evidence[]` list),
  `anomaly-rule-<id>` (small mono caption with the rule key).
- Pill colour: `severity === "alert"` → terracotta; otherwise sage.
- The new `anomaly_dollar_impact_total` and `informational_notes`
  fields on the Statement object should be rendered too.

### 4.2 Budget Calculator
- Three-card top row: `bc-quarterly-gross`, `bc-care-management`,
  `bc-quarterly-usable`. Use the new fields directly — drop any read
  of `quarterly_total`.
- Per-stream card: `bc-streams`, `bc-streams-source`
  (`"Indicative split"` amber vs `"From your latest statement"` sage),
  `bc-streams-note`.
- **NEW**: Supplements picker `bc-supplements` (six checkboxes:
  `bc-supplement-oxygen`, `bc-supplement-enteral_bolus`,
  `bc-supplement-enteral_non_bolus`, `bc-supplement-veterans`,
  `bc-supplement-dementia_cognition`, `bc-supplement-eachd_top_up`).
- **NEW**: Supplements result card `bc-supplements-result` with
  per-supplement annual rows, `bc-supplements-total` for the combined
  figure, and `bc-supplement-warnings` for the filtered-out reasons.

### 4.3 Caregiver Dashboard
- `dashboard-streams-note` + `dashboard-streams-source` pill.
- **NEW**: Pathway eligibility tile `dashboard-pathways` containing one
  `dashboard-pathway-<name>` row per eligible pathway and a
  `dashboard-pathway-cta-<name>` deeplink into the Reassessment Letter
  screen (`?letter_type=rcp_assessment`).
- Quarterly summary line must read `quarterly_usable` (not the removed
  `quarterly_total`).

### 4.4 Contribution Estimator
- Cohort picker: 4 options — `ce-pension-full`, `ce-pension-part`,
  `ce-pension-cshc`, `ce-pension-self`.
- Conditional rate inputs `ce-rate-inputs` (visible for part / cshc):
  `ce-independence-rate`, `ce-everyday-rate`.
- Result block — switch on `rate_basis`:
  - `"band_range"` → render `ce-annual-range`
    (`$low–$high`) plus `ce-caveat` banner with the Services Australia
    sentence.
  - `"user_supplied"` / `"exact_rate"` → render scalar `ce-annual`.
- Error path: backend returns HTTP 400 with detail when a user-supplied
  rate is outside the cohort band — surface inline as `ce-error`.

### 4.5 Care Plan Reviewer
- Optional context fields: `cp-classification` select,
  `cp-quarterly-budget` numeric input.
- Result card `cp-checks` rendering exactly six pill rows, one per
  canonical key, with testids
  `cp-check-budget_fit`, `cp-check-care_management_cap`,
  `cp-check-service_list`, `cp-check-stream_alignment`,
  `cp-check-review_date`, `cp-check-goals_alignment`. Pill colour:
  `pass` = sage, `flag` = terracotta, `unknown` = amber.

### 4.6 Reassessment Letter Drafter
- Letter-type selector (three cards): `rl-type-classification_reassessment`,
  `rl-type-rcp_assessment`, `rl-type-care_plan_amendment`.
- Conditional `rl-rcp-fields` block (visible only for RCP) with
  `rl-hospital` and `rl-discharge` inputs.
- API payload must strip `hospital_name` / `discharge_date` when the
  letter type isn't `rcp_assessment` (the web's `submit` handler does
  this — copy the pattern).

### 4.7 Provider Price Checker
- `pc-caps-note` — static informational banner above the form (and on
  the gated/blocked state) explaining national price caps were deferred
  indefinitely in May 2026.
- Result block: `pc-result-caps-note` carries the live `caps_note`
  string from the API response.
- The verdict logic is median-only — there is no `cap` field in the
  response. Don't reintroduce one in the UI.

### 4.8 Aged Care Q&A (renamed from Family Coordinator)
- Header: **"Aged Care Q&A"** with subtitle
  `"Plain-English answers about the Support at Home program, grounded in
  the Aged Care Act 2024."`.
- Small subtext below the title:
  `"This is a general Q&A assistant — it can't see your account or
  statements. Signed-in members can ask the in-app assistant questions
  about their own household."`
- Container `data-testid="aged-care-qa"`.
- API call goes to `/public/aged-care-chat`.

---

## 5. Decoder rule keys mobile can surface

The persisted anomaly metadata (iteration 44) now carries a rule key,
dollar impact, and evidence array. Rules added in this delta:

| Rule | Severity | Triggered by | UX hint |
|---|---|---|---|
| `RULE_9_CONTRIBUTION_MISMATCH` | medium | implied per-line rate outside cohort band | show band in detail string |
| `RULE_9_INCONSISTENT_RATE` | medium | two lines in same stream imply different rates | one card per stream |
| `RULE_11B_ATHM_AMOUNT_EXCEEDS_TIER` | low | AT-HM line > $15,000 without `"exceedance approved"` provider note | informational pill |
| `RULE_16_SUPPLEMENT_AMOUNT_VARIANCE` | medium | supplement line daily rate diverges from seed by > $0.50 | flag with section citation |

---

## 6. Acceptance criteria for the mobile build

1. **No reads of removed fields**: grep the mobile source — `quarterly_total`
   and `family-coordinator-chat` must not appear in any active code path.
2. **Budget Calculator** produces correct figures for every L1–L8 ongoing
   classification + L1–L4 transitional (when `is_grandfathered=true`).
3. **Contribution Estimator** correctly switches between exact-rate,
   user-supplied and band-range modes; out-of-band rates show the 400
   error inline; CSHC accepted as a cohort.
4. **Care Plan Reviewer** renders six checks in canonical order with the
   right pill colour for each status.
5. **Reassessment Letter Drafter** generates the three letter types; the
   RCP letter contains the literal phrase "Restorative Care Pathway"
   plus the supplied hospital name.
6. **Aged Care Q&A** chat asks "what is my mum's budget?" → response
   contains no `$` figure AND directs the user to the in-app assistant.
7. **Statement Detail** shows the new aggregate impact pill + per-row
   evidence + rule caption.
8. **Dashboard pathway tile** appears for households whose statements
   carry RCP / EoL trigger phrases and is hidden otherwise.
9. **`data-testid` parity** with the selectors quoted in §4 so the web
   E2E plan can be reused.

When all nine pass on iOS + Android, the mobile build is at parity with
Wayly web iterations 39–48.
