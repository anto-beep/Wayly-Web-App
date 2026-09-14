# Mobile Agent Prompt — Wayly UI-1 Backend Overhaul + Indicative Prices Delta (Feb 2026)

Paste everything from the `===` separator below into the mobile agent. This is the **delta** prompt for the post-MVP work the web team shipped in Feb 2026. It assumes the mobile app already has feature parity with the original handoff (`/app/MOBILE_AGENT_PROMPT.md` + `/app/MOBILE_AGENT_DASHBOARD_PROMPT.md` + `/app/MOBILE_HANDOFF_STATEMENT_LIFECYCLE.md`).

This prompt covers items **1a, 2a, 3a, 4a, 5a, 6a, 7a, 8a, 9a (web)** that were verified against the official Department of Health PDFs in February 2026, plus every UI overhaul that shipped under "UI-1 Backend Overhaul" and the in-house Support Ticketing build. The web app at https://wayly.com.au is the source of truth. The web codebase is on disk — paths referenced inline.

===

# Mobile App — Wayly UI-1 Backend Overhaul Delta (Feb 2026)

Everything below is a CHANGE from the previous mobile handoff. Implement each item, then run through the verification checklist at the end. **The official Department of Health PDFs cited below are stored at the public artifact URLs at the foot of this doc** — read them as the legal source of truth, not what you find elsewhere on the internet.

---

## 0. Quick-look — what changed in one paragraph

The contribution-rate bands now treat **Part Pension and CSHC as the same cohort** (5%–50% Independence, 17.5%–80% Everyday Living). The classification annual budget figures are **verified against the DoH Schedule of Subsidies effective 1 November 2025**. The Provider Price Checker now ships with **27 official DoH indicative prices** (median + lower + upper) and a **"Compare to your statement" prefill**. National price caps are **deferred indefinitely** — every caps reference and every cap-related copy block must be removed. We replaced Zendesk with a **custom in-house Support Ticketing system** and every AI tool grew a **Report Issue side panel**. Dark-mode tokens, DD/MM/YYYY everywhere, Title Case sweep, react-big-calendar, a 5-step Switch Provider wizard, drag-and-drop AT-HM uploads, a new Key Contacts side panel — full list below.

---

## 1. Contribution-rate bands — part-pension + CSHC are the SAME cohort

### Source PDF
`support-at-home-program-participant-contributions.pdf` (effective 1 November 2025), page 2. The web audit document at `/app/docs/audit-9a-classification-figures.md` shows the cross-reference in full.

### Rule
Standard contribution rates from 1 November 2025:

| Age Pension status | Clinical | Independence | Everyday Living |
|---|---|---|---|
| Full pensioner | 0% | **5% (exact)** | **17.5% (exact)** |
| **Part pensioner OR CSHC** | 0% | **5%–50% (band)** | **17.5%–80% (band)** |
| Self-funded retiree | 0% | 50% (exact) | 80% (exact) |

The 0%–25% bands you may see in older mobile code belong to the *No Worse Off principle* cohort (grandfathered HCP transitions), not standard part-pension.

### Mobile change
Wherever the mobile codebase has a `PENSION_RATES` / pension-band table, update `part_age_pension` to mirror `cshc`:
```
part_age_pension: { Independence: (0.05, 0.50), EverydayLiving: (0.175, 0.80) }
cshc:              { Independence: (0.05, 0.50), EverydayLiving: (0.175, 0.80) }
```
Keep the cohort label "Part Age Pension" distinct in the UI for clarity — the band is the same but the user-facing label still matters.

### Rule 9 (Statement Decoder)
If the mobile statement-decoder runs Rule 9 client-side, the band-validation check must use the new wider band so a 30% Independence rate on a part-pension statement is **silent**, but 60% **flags**. Web tests: `tests/test_pension_rates.py` (case `test_part_pension_independence_above_band_flags_once`).

---

## 2. Price caps are deferred indefinitely — purge all "1 July 2026" cap copy

### Source PDFs
- `support-at-home-program-participant-contributions.pdf` (the document explicitly states these figures are **not** price caps and are not recommended prices)
- Web seed file `/app/backend/seed_program_reference.py` carries `policy.price_caps_status = "deferred_indefinitely"` from 2026-05-20 and **closes** the `policy_date.price_caps_start = 2026-07-01` row at 2026-05-19.

### Rule
The Australian Government announced on 20 May 2026 that national provider price caps under Support at Home are deferred indefinitely. Providers continue to set their own prices until further notice.

### Mobile change — copy sweep
- Remove every "from 1 July 2026" or "national price caps" line from marketing screens, in-app help, FAQ, push notifications, and email templates.
- Replace with one canonical paragraph (paste verbatim — used on Web Price Checker):

> **Price caps deferred.** The Australian Government announced in May 2026 that the planned 1 July 2026 national provider price caps under Support at Home are deferred indefinitely. Providers continue to set their own prices. This tool compares your provider's rate against the official indicative ranges published by the Department of Health (October 2025) — not a government cap. If you believe you have been overcharged, the Aged Care Quality and Safety Commission can order refunds.

- Add an `ACQSC complaint pathway` link/CTA next to the paragraph where space allows.
- Adviser overlays, Ask Wayly chat onboarding bubble, and any pricing-related blog post stub must be updated too.

### Mobile change — data files
Any `price_caps_start_date` constant must be replaced with a flag `price_caps_status: "deferred_indefinitely"`. Sample fetch:
```
GET /api/program_reference/public/snapshot
→ { ..., "policy_status": { "price_caps": "deferred_indefinitely" }, ... }
```
Use that snapshot field instead of any hard-coded date.

---

## 3. Rollover-cap clarification (NO maths change)

### Source
Aged Care Rules 2025, ss.193-5 + 229-5 + 238-5. Schedule of Subsidies PDF cross-check.

### Verdict
The existing rollover-cap formula (`max($1,000, 10% × base_individual_quarterly_amount)`) is **correct**. The "base individual quarterly amount" equals `daily_total × 365 × 0.9 / 4` (90% of gross annual / 4), because the provider's `base_provider_amount` (s.238-5) is excluded from the participant's spendable budget.

### Mobile change
- **No maths change.** If the mobile code uses `gross_annual / 4` directly for the rollover cap, switch to `(daily_total × 365) × 0.9 / 4`. Verify with Class 8: rollover_cap = $1,757.39 (the wrong-base figure would be $1,952.65).
- Rename any mobile variable called `post_care_management_quarterly` to `base_individual_quarterly` — the previous label is misleading. The care-management 10% is a SEPARATE deduction taken from the participant's base individual amount, not the provider's slice.
- Update any code comment to cite "AC Rules 2025 s.193-5 + s.229-5; verified against DoH Schedule of Subsidies".

---

## 4. Contribution Estimator parity (rate bands, CSHC, midpoints)

### Endpoint (unchanged URL, expanded body)
`POST /api/public/contribution-estimator`
```
Body:
  classification: 1-8
  pension_status: "full" | "part" | "cshc" | "self"   ← NEW: "cshc" accepted
  expected_mix_clinical_pct: number     (must sum to ~100 ± 5)
  expected_mix_independence_pct: number
  expected_mix_everyday_pct: number
  independence_rate_pct?: number    (optional; if supplied, must sit inside cohort band)
  everyday_rate_pct?: number        (optional; same band rule)

Response:
  rate_basis: "exact" | "band_range" | "user_supplied"
  annual_contribution: number | null         (null when rate_basis = "band_range")
  annual_contribution_low: number | null
  annual_contribution_high: number | null
  caveat: string | null                       (non-null for band_range)
  per_stream: [
    {
      stream: "Clinical" | "Independence" | "Everyday Living",
      rate_pct: number | null,                (null for band cohorts when no user rate)
      rate_pct_low: number | null,
      rate_pct_high: number | null,
      rate_band_pct: [number, number] | null,
      is_band: boolean,
      annual: number | null,
      annual_low: number | null,
      annual_high: number | null,
    }
  ]
  years_to_cap: number | null
  years_to_cap_low: number | null
  years_to_cap_high: number | null
```
- When `pension_status = "part"` and **no** explicit rates supplied → `rate_basis = "band_range"`, `Independence rate_pct_low=5.0, rate_pct_high=50.0` (NOT 25.0), `EverydayLiving rate_pct_high=80.0`.
- When `pension_status = "cshc"` → identical band to "part".
- 400 on user-supplied rate outside cohort band — error detail cites the band e.g. `"Independence rate 60% is outside the 5%-50% range that applies to a part_age_pension cohort"`.

### Mobile UI
- Show "Range" (low–high) and a midpoint estimate when `rate_basis = "band_range"`.
- When user enters their Services Australia rate, swap to `rate_basis = "user_supplied"` and show the exact figure.
- "Years to cap" should render as a range too (Low–High) for band cohorts.
- A small caveat banner: *"Your exact rate is set by Services Australia based on your income and assets. The range shown reflects the official cohort band."*

---

## 5. Stream allocations labelled indicative + statement-derived overrides

### Backend behaviour
Budget Calculator + Statement Decoder both label `stream_allocations[].indicative = true` when the split is the program-average split. When a statement carries header_stream_budgets, the response uses **statement-derived** allocations and `indicative = false`.

### Mobile UI
- Each stream tile shows `Indicative` badge when `indicative === true`.
- Replace any hard-coded "33/33/33" or program-average note with the new `streams_note` field returned by the API:
  > "Indicative split only. Your participant's actual stream allocation is set in their individualised budget and care plan, and may differ substantially. Check the quarterly budget summary on your provider statement for the real split."
- When statement-derived (header_stream_budgets present), drop the indicative badge and show the period label so the user knows which statement drove the figure.

---

## 6. Anomaly model — persist full detail

### Backend schema
`Anomaly` now carries:
```
{
  id, severity: "info"|"warning"|"alert", title, detail, suggested_action,
  line_item_id, rule, dollar_impact, evidence: [string], raw_severity,
}
```
And `Statement` carries aggregates:
```
{
  ..., anomaly_dollar_impact_total: float (default 0),
       informational_notes: [ { kind, ... } ],   (Rule 12 AT-HM, PPA, etc.)
}
```

### Mobile UI — Statement detail
- Render the **rule key** as a small tag (e.g. `RULE_3_DUPLICATE_LINE`) under each anomaly headline.
- Render `dollar_impact` as `+ $X.XX` (when positive) on the right edge of each anomaly row.
- Show `evidence: string[]` as a bulleted "What we saw" sub-list — quote them verbatim so the user trusts the source.
- Show `anomaly_dollar_impact_total` as a hero figure at the top of the Anomalies tab — "Total potential overcharge: $XX.XX".
- Render `informational_notes` in a separate, calmer section ("Notes for your records") — they are not anomalies and should not look like alarms.
- Old documents without these fields must still render cleanly (use safe defaults).

---

## 7. Public AI tool rename — "Aged Care Q&A" (was "Family Care Coordinator")

### Endpoint
`POST /api/public/chat` (the **unauthenticated, no-household-data** chat).

### Hardening
The system prompt explicitly states the assistant has NO access to the user's account, household, statements, or budget. It is plain-English aged-care Q&A only. The authenticated `/api/chat` (CHAT_SYSTEM_TEMPLATE) is the household-aware "Ask Wayly" — that one is unchanged.

### Mobile change
- Replace every "Family Care Coordinator" string in mobile copy + navigation + push notifications with **"Aged Care Q&A"**.
- Route slug: `aged-care-qa` (was `family-coordinator`). Add a permanent redirect on the old slug.
- "Ask Wayly" (authenticated, household-aware) stays — do not conflate the two.

---

## 8. Care Plan Reviewer — six structured checks + RCP/amendment letters

### Care Plan Reviewer endpoint
`POST /api/public/care-plan-review`
Body: `{ text, classification?, quarterly_budget? }`
Response includes `checks: [{ check, status, note }, ...]` where `check` ∈
```
budget_fit | care_management_cap | service_list | stream_alignment | review_date | goals_alignment
```
- Each check has `status ∈ { "pass", "flag", "unknown" }`.
- For `budget_fit` and `care_management_cap`, when `quarterly_budget` is supplied, the backend OVERRIDES the LLM with a deterministic numeric check. Always render the deterministic verdict over the LLM's guess.
- Render each check as a tile with a green check / amber flag / grey question icon and the note as the body copy.

### Reassessment letter endpoint (3 letter types now)
`POST /api/public/reassessment-letter`
Body now accepts:
```
letter_type: "classification_reassessment" | "rcp_assessment" | "care_plan_amendment"
hospital_name?: string      (RCP only)
discharge_date?: string     (RCP only)
```
- The mobile letter-drafter UI must offer all three options. The Care Plan Reviewer result tile **deep-links** into the drafter with the matching `letter_type` pre-selected (web pattern: `/ai-tools/reassessment-letter?letter_type=rcp_assessment`).

---

## 9. Classification annual budgets — verified figures (do NOT add post-1-July-2026 figures yet)

### Source PDF
`schedule-of-subsidies-and-supplements-for-support-at-home.pdf` (effective 1 November 2025).

### Authoritative figures (memorise these — these are what production runs against)

| Class | Daily total | Daily base_individual | Daily base_provider | Annual (×365) |
|-------|-------------|------------------------|----------------------|---------------|
| 1 | $29.40 | $26.46 | $2.94 | $10,731 |
| 2 | $43.93 | $39.54 | $4.39 | $16,034 |
| 3 | $60.18 | $54.16 | $6.02 | $21,966 |
| 4 | $81.36 | $73.22 | $8.14 | $29,696 |
| 5 | $108.76 | $97.88 | $10.88 | $39,697 |
| 6 | $131.82 | $118.64 | $13.18 | $48,114 |
| 7 | $159.31 | $143.38 | $15.93 | $58,148 |
| 8 | $213.99 | $192.59 | $21.40 | $78,106 |

### Transitional HCP daily totals (no-worse-off cohort)

| Level | Daily total |
|-------|-------------|
| 1 | $30.10 |
| 2 | $52.93 |
| 3 | $115.22 |
| 4 | $174.68 |

### Other figures from the same Schedule
- Restorative Care Pathway: $53.67/day, $6,000/episode, combined cap $12,000
- End-of-Life Pathway: $298.04/day, $25,000 total
- AT-HM tiers: Low $500 / Medium $2,000 / High $15,000 (High once per lifetime)
- Assistance Dog: $2,000
- Dementia & Cognition Supplement: 11.5% of equivalent daily funding (grandfathered HCP only)
- Veterans' Supplement: 11.5% of equivalent daily funding
- EACHD Top-Up: $3.45/day (grandfathered)
- Oxygen Supplement: $14.66/day
- Enteral feeding — Bolus: $23.25/day, Non-bolus: $26.11/day
- Care Management Supplement: $3.95/day

### Lifetime caps
- Standard: **$135,318.69** (effective from 1 Nov 2025, until next indexation)
- Grandfathered / no-worse-off: **$84,571.66**
- Both indexed on 20 March and 20 September each year. 20 March 2026: $137,917.01 / $86,185.23.

### Mobile change
- Any hardcoded subsidy table on mobile must be replaced with these figures.
- **Do NOT seed post-1-July-2026 indexed figures.** DoH has not published them yet. The web app intentionally has none. When DoH publishes, both apps will add them together.
- If the mobile app has a "Subsidy fallback" dict (the way the old web `batch2_routes.py` had one), audit it line-by-line — the figures must match the table above exactly.

---

## 10. Indicative service prices — NEW dataset, NEW Price Checker UX

### Source PDF
`summary-of-indicative-support-at-home-prices.pdf` (Department of Health, October 2025).

### Full table (27 services — these are the canonical names used in `PRICE_BENCHMARKS`)

| Service | Median | Lower | Upper | Unit | Stream |
|---|---|---|---|---|---|
| Nursing care | $150 | $125 | $179 | hour | Clinical |
| Registered nurse | $160 | $144 | $186 | hour | Clinical |
| Enrolled nurse | $140 | $120 | $163 | hour | Clinical |
| Nursing assistant | $110 | $92 | $143 | hour | Clinical |
| Allied health and other therapeutic services | $195 | $160 | $220 | hour | Clinical |
| Allied health therapy assistant | $122 | $105 | $167 | hour | Clinical |
| Counsellor or psychotherapist | $208 | $160 | $225 | hour | Clinical |
| Dietitian or nutritionist | $200 | $165 | $219 | hour | Clinical |
| Exercise physiologist | $190 | $165 | $219 | hour | Clinical |
| Occupational therapist | $200 | $174 | $220 | hour | Clinical |
| Physiotherapist | $185 | $160 | $210 | hour | Clinical |
| Podiatrist | $180 | $153 | $208 | hour | Clinical |
| Psychologist | $228 | $210 | $250 | hour | Clinical |
| Social worker | $200 | $163 | $238 | hour | Clinical |
| Speech pathologist | $208 | $187 | $236 | hour | Clinical |
| Care management | $120 | $80 | $150 | hour | Independence |
| Restorative care management | $150 | $120 | $173 | hour | Independence |
| Personal care | $100 | $85 | $115 | hour | Independence |
| Therapeutic services for independent living | $165 | $140 | $220 | hour | Independence |
| Remedial masseuse | $150 | $134 | $206 | hour | Independence |
| Respite | $99 | $85 | $112 | hour | Independence |
| Social support and community engagement | $99 | $82 | $110 | hour | Everyday Living |
| Transport | $70 | $40 | $97 | trip | Everyday Living |
| Domestic assistance | $95 | $83 | $109 | hour | Everyday Living |
| Home maintenance and repairs | $103 | $85 | $120 | hour | Everyday Living |
| Meal delivery | $15 | $11 | $22 | meal | Everyday Living |
| Meal preparation | $97 | $82 | $110 | hour | Everyday Living |

### Price-check endpoint (expanded response)
`POST /api/public/price-check`
Response now includes:
```
{
  service, charged, median,
  lower, upper,            // ← NEW: official DoH range
  unit,                    // ← NEW: "hour" | "trip" | "meal"
  stream,                  // ← NEW: "Clinical" | "Independence" | "Everyday Living"
  delta_pct,
  verdict,                 // "fair" | "high" | "low"
  verdict_label,           // "Within the indicative range" / "Above the indicative range" / "Below the indicative range"
  assessment,              // sentence explaining the verdict, cites the range
  suggested_action,
  source,                  // "DoH Summary of indicative Support at Home prices (Oct 2025)"
  effective_from,          // "2025-10-01"
  caps_note                // updated copy — see §2
}
```
Verdict logic: rate inside `[lower, upper]` → fair; above `upper` → high; below `lower` → low.

### Compare-to-your-statement prefill (NEW)
New authenticated endpoint:
`GET /api/statements/recent-line-items`
Returns up to 20 distinct `(canonical_service, rate)` pairs from the user's most recent decoded statements, normalised to the canonical service names from the table above. Drop items the normaliser can't map.
```
Response:
{
  items: [
    {
      service: string,        // canonical key (e.g. "Personal care")
      raw_service: string,    // original line description for tooltips
      unit_price: number,
      period_label: string,   // e.g. "April 2026"
      statement_id: string,
      uploaded_at: ISO datetime
    },
    ...
  ],
  count: number
}
```

### Mobile UI — Price Checker
1. **Service picker**: dropdown with all 27 canonical names, grouped by stream (Clinical → Independence → Everyday Living) in that order. Group headers in the picker, not flat list.
2. **Prefill pill row** above the form (shown ONLY when `GET /api/statements/recent-line-items` returns items):
   - Heading "From your recent statements"
   - Helper text "Tap a line to copy its service and rate into the checker."
   - Pills showing `[Service · $rate]`, tapping fills both fields and focuses the rate input.
3. **Rate input** label: `Rate charged ($/hr, $/trip or $/meal)` — the unit hint matters for Transport ($/trip) and Meal delivery ($/meal).
4. **Result**: three-tile layout
   - You're charged: `$X.XX` + small `per {unit}` label
   - Indicative median: `$X.XX` + `per {unit}` label
   - Indicative range: `$lower – $upper` + `DoH October 2025` provenance
5. **Stream badge** on the verdict card (Clinical / Independence / Everyday Living) with the stream tint:
   - Clinical: teal-ink tint
   - Independence: sage tint
   - Everyday Living: gold tint
6. **Caps-note panel** uses the verbatim copy from §2.
7. **How this works** footer references "Department of Health 'Summary of indicative Support at Home prices' (October 2025)" — not "network medians".

### Legacy service-name aliases
For backwards compat, these old hyphenated names must still resolve to the canonical entry above (they're aliased on the web):
- "Domestic assistance — cleaning" → "Domestic assistance"
- "Occupational therapy" → "Occupational therapist"
- "Physiotherapy" → "Physiotherapist"
- "Social support" → "Social support and community engagement"
- "Transport — community access" → "Transport"
- "Home maintenance / gardening" → "Home maintenance and repairs"
- "Nursing — registered" → "Registered nurse"
- "Allied health — podiatry" → "Podiatrist"

---

## 11. Custom In-house Support Ticketing (replaces Zendesk)

This is a brand-new module. The web app no longer uses Zendesk.

### Endpoints
- `POST /api/support/tickets` — create a ticket (body: `subject`, `body`, `category`, `priority`, optional `tool_name`, `tool_input`, `tool_output`)
- `GET /api/support/tickets` — list current user's tickets (inbox)
- `GET /api/support/tickets/{id}` — ticket detail including threaded messages
- `POST /api/support/tickets/{id}/messages` — append a message
- Admin endpoints (gated to `super_admin`): list across households, assign, close, etc.
- Email integration via Resend — every ticket and reply fires an email to `hello@wayly.com.au` and acknowledgement to the user. Mobile should NOT replicate the email integration; it relies on the backend.

### Mobile UI
- New **Support** screen in the navigation (it's already in the sidebar group on web — under "PROVIDERS & PAPERWORK" → "Support"). Path: `/support`.
- Inbox: list of the user's tickets with status pill (`open`, `pending`, `closed`), last-message preview, last-updated DD/MM/YYYY.
- Detail: threaded messages, reply form, attachment thumbnails.
- "New Ticket" button at top — modal with category dropdown (`general`, `bug`, `billing`, `feature_request`, `account`, `tool_result`), priority dropdown, subject, body.
- LLM triage flag `SUPPORT_TRIAGE_ENABLED` is currently `false` on the backend — mobile shouldn't render a triage UI yet.

### Report Issue side panel — on EVERY AI tool result
This is the most-used Support entry point. The web pattern:
- Below the AI tool's result block, a single button "Report an Issue With This Result"
- Tap opens a **right-side sliding panel** (NOT a centred modal) — pre-fills `tool_name`, `tool_input`, `tool_output` from the current screen state
- User selects what's wrong (dropdown), free-text describes it, submits as `category=tool_result`
- Critical: on web we use `createPortal(..., document.body)` because the parent `animate-fade-up` Tailwind class uses CSS `transform`, which traps fixed-position children. On mobile React-Native this isn't an issue, but if the mobile build is Capacitor over the same DOM, you must keep the Portal pattern.

### Mobile screen list to wire the Report-Issue side panel into
Every AI tool: Statement Decoder, Budget Calculator, Provider Price Checker, Classification Self-Check, Reassessment Letter, Care Plan Reviewer, Aged Care Q&A, Contribution Estimator. Eight tools, eight result blocks, eight side panels.

---

## 12. Key Contacts side panel (was "Care Circle")

### Endpoints
- `GET /api/participants/{pid}/contacts`
- `POST /api/participants/{pid}/contacts`
- `PATCH /api/participants/{pid}/contacts/{cid}`
- `DELETE /api/participants/{pid}/contacts/{cid}` (soft delete)

### Contact body (matches `ContactBody` on backend)
```
{
  name: string (required, <=120),
  kind: "emergency" | "gp" | "specialist" | "care_manager" | "provider_coordinator"
      | "allied_health" | "pharmacist" | "family" | "friend" | "neighbour"
      | "advocate" | "other",
  role_or_title?: string,
  organisation?: string,
  phone?: string,
  email?: string,
  address?: string,
  notes?: string,
  is_primary: boolean,
}
```

### Mobile UI
- Panel title is **"Key Contacts"** (not "Care Circle").
- Groups in this exact order: Emergency → GP → Specialists → Care Manager → Providers → Allied Health → Pharmacist → Family → Friends → Neighbours → Advocates → Other. Group headers use the plural label (e.g. "Specialists", "Family", "Friends").
- Inside a group, primary contact first, then alphabetical.
- Avatar = initials in a primary-tinted circle.
- Card shows: avatar, full name, role_or_title · organisation (smaller text), primary badge if `is_primary === true`.
- Tap a card to expand: tap-to-call (tel:), tap-to-email (mailto:), tap-to-copy-address (clipboard), notes.
- Each expanded card has Edit and Remove buttons.
- Search bar at the top filters across name, organisation, role_or_title, phone, email, notes.
- Empty state: "Add the people who care for {participant_first_name}. Start with their GP, your care manager, and an emergency contact." + "Add First Contact" CTA.
- Entry point: a **"Key Contacts"** item in the persistent navigation under "Their Care" (web sidebar pattern). Deep link `/app?contacts=open` auto-opens the panel.

### Permissions (matches web)
- Primary Caregiver and Secondary Caregiver: full CRUD.
- Family Member: read + can suggest changes (suggestion inbox is a future backlog item, not yet built on web either).
- Participant + Advisor: read.

---

## 13. AT-HM page rename + drag-drop file uploads

### Heading
- Page title: **"Assistive Technology and Home Modifications"** (Title Case, full words).
- "AT-HM" is permitted as an acronym in body copy only.
- Intro copy must be the verbatim §14.1 block from `/app/docs/ui-1-audit.md` (copy below). Don't paraphrase.

> Assistive Technology and Home Modifications, often shortened to AT-HM, is the part of Support at Home that funds equipment and home changes to help the participant stay safe and independent. This can include things like grab rails, shower stools, ramps, mobility aids, communication devices, and larger home modifications.
>
> Use this screen to track every AT-HM request from the first conversation through to installation. Attach quotes, invoices, photos, and any letter from an occupational therapist or allied health worker. Wayly keeps a record of what was requested, what was approved, what it cost, and which part of the budget it came from.
>
> **Tip:** If you are not sure whether something is covered, the "Ask Wayly" assistant can check eligibility against current AT-HM rules before you request it formally.

### Status column — Title Case display
DB enum is unchanged; the display layer maps via `formatStatus`:
```
proposed   → "Proposed"
approved   → "Approved"
ordered    → "Ordered"
installed  → "Installed"
declined   → "Declined"
```

### File upload endpoints (GridFS-backed, NOT base64 inline)
- `POST /api/athm/{iid}/files` — multipart with `file` field, optional `kind` form field. Returns the attachment metadata.
- `GET /api/athm/{iid}/files/{fid}` — streams the binary with the original filename and mime type.
- `DELETE /api/athm/{iid}/files/{fid}` — soft delete (recoverable for 30 days).

### Rules (enforced backend; mirror on mobile)
- Accepted: `.png .jpg .jpeg .pdf .doc .docx`
- Max 25 MB per file
- Max 20 files per AT-HM request
- 413 on size overrun, 400 on invalid extension, 400 on full ceiling.

### Mobile UI
- Per row, "Documents" toggle that expands an inline section.
- Drag-and-drop on web; mobile = native file picker + photo library + camera.
- Each file row: thumbnail icon (`ImageIcon` for png/jpg, `FileText` otherwise) + filename + upload date (DD/MM/YYYY) + size + Download + Remove buttons.

---

## 14. Calendar rebuilt — react-big-calendar UX on web, "month/week/agenda" on mobile

The web calendar was rebuilt with `react-big-calendar` + `date-fns`. Mobile doesn't need that exact library, but the BEHAVIOUR must match:
- Three view toggle: Month / Week / Agenda
- `Visit` model now carries `status: "active" | "cancelled" | "archived"` — cancelled visits are rendered struck-through, archived hidden by default with a "Show archived" toggle.
- Edit / Cancel / Archive actions per visit.
- DD/MM/YYYY everywhere.

Endpoint surface unchanged (`/api/visits/*`) — see `/app/MOBILE_AGENT_DASHBOARD_PROMPT.md` for the original contract. Only the `status` field is new.

---

## 15. Switch Provider — 5-step wizard with PDF export

The web app rebuilt this tool as a guided 5-step wizard. Mobile must mirror the steps and the auto-drafted notice letter.

### Steps
1. Current provider details (name, contact, account #)
2. New provider details (name, contact, start date)
3. Reason for switching (free text + checkbox list)
4. Auto-drafted notice letter preview (editable)
5. Send / download

### Endpoints
- `POST /api/switch-provider` — create a switch session
- `PATCH /api/switch-provider/{sid}` — advance step / save draft
- `GET /api/switch-provider/{sid}/pdf` — generate the PDF handover letter
- `GET /api/switch-provider/{sid}/letter.txt` — plain-text fallback
- The session resumes from the last saved step on re-open.

### Mobile UI
- Render the 5 steps as a vertical stepper or a horizontal pager (your choice).
- "Save and Exit" on every step.
- PDF preview + share-sheet on step 5 (mobile native share API).

---

## 16. Log a Scenario stepper — cancel modal, switcher drawer, draft persistence

The web `WorkflowsPanel` ships:
- A cancel-confirm modal with three buttons: **Keep Working**, **Save and Exit** (writes a localStorage draft), **Discard and Start Over** (deletes any saved draft).
- A "Switch Workflow" drawer from the header — lets the user jump to a different workflow without losing their progress.
- Auto-save: every successful step submission writes the draft to local storage.
- Catalogue cards show a Clay "Resume Draft (Step N)" pill when a draft exists, and the CTA flips from "Start" to "Resume".

### Mobile change
- Replace single-button "Close" with the three-button cancel-confirm modal.
- Add the Switch Workflow drawer to the workflow header.
- Persist drafts to the device (AsyncStorage on RN or `localStorage` on Capacitor). Key: `wayly:workflow-drafts:{participant_id}`. Value: `{ [workflow_key]: { stepIdx, payload, completedSteps, savedAt } }`.
- Catalogue cards: render the "Resume Draft (Step N)" pill when a draft exists; CTA copy changes accordingly.

---

## 17. Signup form — First/Last/Email/Mobile/Password

The signup form was reshaped. Mobile must match:
- `first_name` (required)
- `last_name` (required)
- `email` (required, validated)
- `mobile` (required, AU mobile regex — `04XX XXX XXX`)
- `password` (required, ≥8 chars)

The backend `User` model carries `first_name`, `last_name`, `mobile`. Anywhere the mobile app composes a display name, render `${first_name} ${last_name}`.

---

## 18. SMS endpoints deprecated (410 Gone)

- `/api/sms/*` returns **410 Gone**.
- The Settings → SMS Alerts tab was REMOVED. Mobile must remove the same tab.
- Any "SMS" toggle on the participant profile or notification preferences UI must be deleted.
- Push notifications + email are the only remaining notification channels.

---

## 19. Date format — DD/MM/YYYY everywhere

The web app added `lib/formatDate.js` with three exports: `formatDate(input)`, `formatDateTime(input)`, `formatRelative(input)`. All caregiver-facing date rendering goes through them.

### Mobile change
Build the equivalent module. Inputs accepted:
- ISO strings (`2026-04-15`, `2026-04-15T12:30:00Z`)
- Date instances
- Australian short strings (`15/04/2026`) — pass through

Outputs:
- `formatDate` → `15/04/2026`
- `formatDateTime` → `15/04/2026, 12:30 pm`
- `formatRelative` → `Just now`, `5 minutes ago`, `2 hours ago`, `Yesterday`, otherwise falls back to `formatDate`.

Apply to: Reports, Caregiver Dashboard, Notifications Bell, Dashboard Timeline, Email Forwarding Panel, Statement Lifecycle Modals, every visit card on the calendar, every AT-HM document upload timestamp, every Support ticket row.

---

## 20. Title Case sweep + Australian English + em-dash rule

- **Title Case** on every heading, every section label, every status pill, every nav item, every empty-state CTA.
- **Australian English** everywhere — "organisation" not "organization", "personalised" not "personalized", "manoeuvre" not "maneuver", etc.
- **NO em-dashes** in user-facing copy (`—`). Use hyphens (`-`) or full stops. Em-dashes in code, comments, and audit docs are fine.
- The marketing site "Australian-Hosted", "Privacy-First", "Independent", "AI Powered" hero pills must use those exact casings (not "Australian Hosted" etc.).
- The header tagline "Support at Home, in plain English" was removed — keep the Wayly wordmark only.

---

## 21. Dark mode tokens

The web app uses CSS variables for theming. Both Settings and the AccessibilityWidget toggle the same `theme-dark` class on `<html>`. There are TWO storage keys that must stay in sync:
- `wayly:app:appearance` ∈ `"light" | "dark"` (used by Settings)
- `wayly_a11y_v1.dark` ∈ `boolean` (used by the AccessibilityWidget)

### Mobile change
- Mirror the dark-mode token system. The user's appearance preference is read at boot and applied before the first render.
- Token values come from the web `frontend/src/index.css` block under `html.theme-dark`. Key tokens to mirror:
  - `--kindred-primary` (Teal-Ink, lifted in dark mode to `#4FA8AE` for AAA contrast)
  - `--kindred-surface` (dark surface)
  - `--kindred-surface-2` (raised dark surface)
  - `--kindred-border` (subtle dark border)
  - `--kindred-text`, `--kindred-text-2`, `--kindred-muted`
  - `--kindred-sage`, `--kindred-gold`, `--wayly-clay-500` etc.

### Common pitfall (FIXED on web; check on mobile)
Pages that pre-date the token system used hardcoded hex (e.g. `bg-[#FBF8F3]` cream, `text-[#0E4D52]` teal). In dark mode the global text colour rule made the text white, but the bg stayed cream → invisible. The web fix is a CSS override block that remaps every hardcoded hex literal to a dark equivalent. Mobile must avoid hardcoded brand hex in components — always use tokens.

---

## 22. Dashboard charts — taller, brand-palette bars

The Caregiver Dashboard ships a `DashboardInsights` component with two prominent charts:

### Monthly Spend
- 280px tall area
- Teal-Ink primary fill (with a subtle gradient: `linear-gradient(180deg, primary 0% 70%, rgba(14,77,82,0.92) 100%)`)
- Clay diagonal-striped overlay at the bar's base for co-payment
- Y-axis ticks rounded to a nice value (e.g. $0 / $2k / $4k / $6k / $8k)
- IBM Plex Mono tabular value labels above each bar (e.g. `$7.3k`)
- Horizontal gridlines at `--kindred-border, 30% opacity`
- Legend: solid square (Gross billed) + dashed square (Co-payment)
- Written empty state: "No data yet. Once your provider statement is decoded, monthly spending will appear here." with faint placeholder bars behind it

### Anomalies Over Time
- 240px tall stacked columns
- Terracotta segment = alerts, Gold = warnings, Sage = info
- Integer y-axis ticks (0 / 4 / 8 / 12 / 16…)
- Legend with icon + colour for each severity
- Same gridline and empty-state treatment
- Hover shadow lift on every bar; tooltip shows the breakdown.

### Mobile change
Charts on mobile native = Victory / Reanimated / Skia bar charts; on Capacitor, copy the web component. **The visual treatment matters** — these are the user's primary at-a-glance comprehension tools. Bars must be prominent and tall, not thin sparklines. Brand palette must be respected (no rainbow / pastel defaults).

---

## 23. Hero pills (marketing site)

The four hero pills are: **Australian-Hosted**, **Privacy-First**, **Independent**, **AI Powered**. Casings exact. Dark-mode tokens apply.

---

## 24. Indicative stream allocation note copy (verbatim)

When the budget calculator + dashboard render the program-average stream split, they must surface this exact sentence:

> "Indicative split only. Your participant's actual stream allocation is set in their individualised budget and care plan, and may differ substantially. Check the quarterly budget summary on your provider statement for the real split."

---

## 25. Verification checklist for the mobile team

Before merging the parity PR, every item below must be ticked:

- [ ] **§1** Part-pension `Independence` band returns `[5.0, 50.0]` and `Everyday` returns `[17.5, 80.0]`. CSHC matches identically.
- [ ] **§1** Rule 9 stays silent for a 30%-Independence rate on a part-pension statement; flags at 60%.
- [ ] **§2** No "1 July 2026" cap copy survives in any mobile string, README, FAQ, push template, or email.
- [ ] **§3** Class 8 rollover cap returns $1,757.39 (not $1,952.65). Variable named `base_individual_quarterly`, not `post_care_management_quarterly`.
- [ ] **§4** Contribution Estimator accepts `pension_status: "cshc"` and returns `rate_basis: "band_range"` with the new band.
- [ ] **§5** Every stream tile shows the `Indicative` badge when no statement-derived data is present; tile drops the badge when statement data overrides.
- [ ] **§6** Statement detail renders rule key, dollar_impact, evidence per anomaly + `anomaly_dollar_impact_total` hero figure.
- [ ] **§7** "Family Care Coordinator" returns zero hits in the mobile codebase. Route slug is `aged-care-qa`.
- [ ] **§8** Care Plan Reviewer renders 6 check tiles in canonical order. Reassessment letter drafter offers all 3 letter types.
- [ ] **§9** Subsidy table matches the 8 figures above to the dollar. No post-1-July-2026 figures present.
- [ ] **§10** Provider Price Checker dropdown lists all 27 services, grouped by stream. Result shows median + range + unit + stream badge.
- [ ] **§10** Prefill pills row renders for users with decoded statements; tap auto-fills service + rate.
- [ ] **§11** Custom Support inbox + ticket detail + new-ticket form + Report Issue side panel wired into every AI tool.
- [ ] **§12** Key Contacts panel renders groups in the spec order with search; empty state mentions participant first name.
- [ ] **§13** AT-HM page heading is "Assistive Technology and Home Modifications"; intro copy verbatim; status Title Case via formatStatus.
- [ ] **§13** AT-HM file uploads work end-to-end up to 25 MB, 20 files, with valid types only. 25 MB upload succeeds (NOT BSON-limited).
- [ ] **§14** Visit `status` field handled correctly: active / cancelled / archived. Calendar has Month / Week / Agenda toggle.
- [ ] **§15** Switch Provider 5-step wizard with PDF export at step 5.
- [ ] **§16** Log a Scenario cancel-confirm + Switch Workflow drawer + Resume Draft pill.
- [ ] **§17** Signup form collects first_name, last_name, email, mobile, password.
- [ ] **§18** `/api/sms/*` returns 410 — mobile never calls it. Settings has no SMS tab.
- [ ] **§19** Every date rendering goes through `formatDate` / `formatDateTime` / `formatRelative`. Output is `DD/MM/YYYY`.
- [ ] **§20** Em-dashes purged from copy. Title Case sweep complete.
- [ ] **§21** Dark mode tokens applied; both appearance stores bidirectionally synced.
- [ ] **§22** Dashboard charts are 280px / 240px tall, brand palette, gridlines, value labels.
- [ ] **§23** Hero pills exact casing.

---

## Source PDFs (authoritative — read these, not the internet)

1. **Schedule of Subsidies and Supplements** (effective 1 November 2025)
   https://customer-assets.emergentagent.com/job_aged-care-os/artifacts/hzkzg6p2_schedule-of-subsidies-and-supplements-for-support-at-home_0.pdf

2. **Aged Care Rules 2025** (s.193-5 rollover, s.229-5 base individual, s.238-5 base provider, ss.196-15/20/25/30/35 supplements)
   https://customer-assets.emergentagent.com/job_aged-care-os/artifacts/qmqh5ej8_Aged%20Care%20rules.pdf

3. **Support at Home — Participant Contributions** (effective 1 November 2025)
   https://customer-assets.emergentagent.com/job_aged-care-os/artifacts/jpqns1fy_support-at-home-program-participant-contributions.pdf

4. **Summary of Indicative Support at Home Prices** (October 2025)
   https://customer-assets.emergentagent.com/job_aged-care-os/artifacts/kuo7ds2i_summary-of-indicative-support-at-home-prices.pdf

5. **Support at Home — Services** (stream descriptions)
   https://customer-assets.emergentagent.com/job_aged-care-os/artifacts/ucsfphux_support-at-home-program-services.pdf

6. **Support at Home — Service List** (in-scope / out-of-scope per stream)
   https://customer-assets.emergentagent.com/job_aged-care-os/artifacts/k8c2wied_support-at-home-service-list.pdf

7. **Support at Home — Self-Management** (10% care-management deduction, third-party overhead cap)
   https://customer-assets.emergentagent.com/job_aged-care-os/artifacts/nptjk4wu_support-at-home-program-self-management.pdf

---

## Where to find the web reference code

| What | Path |
|---|---|
| UI-1 audit doc | `/app/docs/ui-1-audit.md` |
| Classification figures audit | `/app/docs/audit-9a-classification-figures.md` |
| Pension rate bands | `/app/backend/agents.py` (`_PENSION_RATES`) |
| Public tool helpers | `/app/backend/lib/tool_helpers.py` (`PENSION_RATES`, `PRICE_BENCHMARKS`) |
| Seed reference data | `/app/backend/seed_program_reference.py` |
| Budget maths | `/app/backend/budget.py` |
| Contribution Estimator endpoint | `/app/backend/server.py` `public_contribution_estimator()` |
| Care Plan Reviewer endpoint | `/app/backend/server.py` `public_care_plan_review()` (six checks) |
| Reassessment letter endpoint | `/app/backend/server.py` `public_reassessment_letter()` (3 letter types) |
| Price Checker endpoint | `/app/backend/server.py` `public_price_check()` |
| Recent line items endpoint | `/app/backend/server.py` `recent_line_items_for_price_check()` |
| Support tickets | `/app/backend/routes/support.py` |
| Participant contacts | `/app/backend/routes/participant_contacts.py` |
| AT-HM uploads (GridFS) | `/app/backend/extended_routes.py` `upload_athm_file()` |
| Statement model + Anomaly model | `/app/backend/models.py` |
| Dashboard charts component | `/app/frontend/src/components/DashboardInsights.jsx` |
| Workflows panel (drafts + switcher) | `/app/frontend/src/components/WorkflowsPanel.jsx` |
| Participant Contacts panel | `/app/frontend/src/components/ParticipantContactsPanel.jsx` |
| Price Checker page | `/app/frontend/src/pages/tools/PriceCheckerTool.jsx` |
| AT-HM page | `/app/frontend/src/pages/extended/AthmTracker.jsx` |
| Switch Provider wizard | `/app/frontend/src/pages/extended/ProviderSwitch.jsx` |
| Calendar | `/app/frontend/src/pages/extended/VisitCalendar.jsx` |
| Signup | `/app/frontend/src/pages/Signup.jsx` |
| Settings (no SMS tab) | `/app/frontend/src/pages/Settings.jsx` |
| formatDate util | `/app/frontend/src/lib/formatDate.js` |
| formatStatus util | `/app/frontend/src/lib/formatStatus.js` |
| Dark-mode tokens | `/app/frontend/src/index.css` (under `html.theme-dark`) |

---

When everything ticks on the checklist, drop a screenshot of each updated screen into the parity PR and tag the web team. We will spot-compare against the web build on dev.wayly.com.au.
