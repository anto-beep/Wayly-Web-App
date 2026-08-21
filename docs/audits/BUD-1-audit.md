# BUD-1 v1 — Phase 0 Audit Report

**Audit date:** Feb 2026
**Auditor:** E1 (Emergent agent)
**Route confirmed:** `/ai-tools/budget-calculator` (frontend), `POST /api/public/budget-calc` (backend).

---

## 0.1 File tree of the current calculator

**Frontend**
- `/app/frontend/src/pages/tools/BudgetCalculatorTool.jsx` — the tool page (410 lines). Contains the entire form + result view.
- `/app/frontend/src/components/ProfileInlinePrompts.jsx` — hosts the top "Add what we're missing" card (`HEADER_BY_WHERE.budget_calculator`) with its own `SupplementsEditor` and its own `SUPPLEMENT_OPTIONS`.
- `/app/frontend/src/lib/programReference.js` — client mirror of `/api/program-reference/public` (used to hydrate live figures).

**Backend**
- `/app/backend/server.py` L3920–L4070 — `@api.post("/public/budget-calc")` handler.
- `/app/backend/budget.py` — pure calc helpers (`classification_annual`, `quarterly_budget`, `stream_allocations`, `rollover_cap`, `lifetime_cap`).
- `/app/backend/program_reference.py` — point-in-time seeded reference layer.
- `/app/backend/seed_program_reference.py` — official constants seed (L128, L133 for lifetime caps; L236–L247 for grandfathered-only supplements).

---

## 0.2 Supplement state — two independent sources (BUG confirmed)

**Top card ("Add what we're missing")** — lives inside `ProfileInlinePrompts.jsx::SupplementsEditor`. Local state: `useState(participant?.applicable_supplements || [])` + `useState(participant?.enteral_feeding_type || "")`. Its options list is DIFFERENT:

```js
// ProfileInlinePrompts.jsx L243-249 — one row for enteral, no bolus/non-bolus split
const SUPPLEMENT_OPTIONS = [
    { v: "oxygen",              label: "Oxygen",             desc: "$14.66/day" },
    { v: "enteral",             label: "Enteral feeding",    desc: "Bolus $23.25 · Non-bolus $26.11" },
    { v: "veterans",            label: "Veterans (DVA card)", desc: "11.5% of base individual daily" },
    { v: "dementia_cognition",  label: "Dementia & cognition", desc: "11.5% (grandfathered HCP only)" },
    { v: "eachd_top_up",        label: "EACHD top-up",       desc: "$3.45 (grandfathered HCP only)" },
];
```

Save flow: `PATCH /api/participants/:pid` with `{ applicable_supplements, enteral_feeding_type? }`.

**Bottom section ("Applicable supplements (optional)")** — lives inside `BudgetCalculatorTool.jsx` L49-56 with its OWN options list which DOES split enteral bolus vs non-bolus into two checkboxes:

```js
// BudgetCalculatorTool.jsx L49-56 — TWO checkboxes for enteral
const SUPPLEMENT_OPTIONS = [
    { value: "oxygen",             label: "Oxygen supplement",           sub: "$14.66/day …" },
    { value: "enteral_bolus",      label: "Enteral feeding (bolus)",     sub: "$23.25/day" },      // ← checkbox 1
    { value: "enteral_non_bolus",  label: "Enteral feeding (non-bolus)", sub: "$26.11/day" },      // ← checkbox 2
    { value: "veterans",           label: "Veterans' supplement",        sub: "11.5% of base individual daily" },
    { value: "dementia_cognition", label: "Dementia & cognition (grandfathered HCP)", sub: "11.5% · grandfathered HCP only" },
    { value: "eachd_top_up",       label: "EACHD top-up (grandfathered)", sub: "$3.45/day · grandfathered since 2013" },
];
```

Local state: `useState([])` in `BudgetCalculatorTool`, driven by `toggleSupplement`. When the top card saves, `onParticipantUpdated` runs `_participantSupplementsToCalc(doc)` which converts `enteral` → either `enteral_bolus` (default) or `enteral_non_bolus` based on `enteral_feeding_type`, so a one-way propagation top → bottom exists ONLY at save-time. There is **no reverse binding** and there is **no live sync**: unchecking Oxygen in the bottom does not un-tick it in the top.

**F1 fix scope:** the bottom section must read/write the SAME array (participant profile), and the top card must collapse once the profile has supplements. Or, more cleanly, drop the bottom section's independent state entirely and drive it from `participant.applicable_supplements` + `enteral_feeding_type` (single source of truth, with a fallback anonymous state for public/unauth visitors).

---

## 0.3 Grandfathered logic

**Constants (from `seed_program_reference.py` L128–L135):**

```py
_row("lifetime_cap.standard",     135318.69, "2025-11-01", eff_to="2026-03-20", ...)   # non-grandfathered
_row("lifetime_cap.no_worse_off",  84571.66, "2025-11-01", eff_to="2026-03-20", ...)   # grandfathered
_row("lifetime_cap.standard",     137917.01, "2026-03-20", ...)                        # indexed
_row("lifetime_cap.no_worse_off",  86185.23, "2026-03-20", ...)                        # indexed
```

Reader (`budget.py::lifetime_cap`):

```py
def lifetime_cap(is_grandfathered: bool, as_of: Optional[date | str] = None) -> float:
    key = "lifetime_cap.no_worse_off" if is_grandfathered else "lifetime_cap.standard"
    return float(get_value(key, _as_of(as_of)))
```

So `is_grandfathered=True` **correctly** loads `$84,571.66` (the HCP no-worse-off cap), and `is_grandfathered=False` **correctly** loads `$135,318.69` (the standard SAH cap). The applied-behaviour side is right; the **UI label on the checkbox is the mismatch** (`L234`):

```jsx
<span className="block text-xs text-muted-k mt-0.5">
    Lifetime cap is {isGrandfathered ? "$84,571.66" : "$135,318.69"}
</span>
```

That is actually already showing the correct pair (spec was based on an earlier state). But per **F4** the label must be **more informative**, i.e. always mention BOTH values with the "no-worse-off" framing.

**Rate switching.** `POST /api/public/budget-calc` (L3939-3967) routes classes 1-4 to transitional HCP figures **when `is_grandfathered=True`** via `budget_lib.classification_annual_transitional()` and rejects classes 5-8 with a 400. **This means the checkbox DOES switch classification daily rates for 1-4** — item (3) in the audit questions. Antony's guidance is "only lifetime cap"; the current code does more than that.

This is Open Item #2 in the spec: **needs confirmation from Antony** before the F1 fix lands. Two options:
- **(a)** Keep the current behaviour (transitional rate switch for classes 1-4). Not what Antony described.
- **(b)** Remove the transitional-rate branch, always use ongoing classification annual figures, use `is_grandfathered` only for the cap and grandfathered-supplement gate. Matches Antony's stated intent.

I recommend **(b)** because it also makes the "class 5-8 + grandfathered → 400" error path go away for a scenario the UI still allows (e.g. a class-6 participant who WAS on an HCP is currently blocked from calculating anything).

**Non-grandfathered cap** — is applied. `is_grandfathered=False` → `lifetime_cap.standard = $135,318.69`. The results view renders the cap via `result.lifetime_cap` (L366 in the tool). This is only invisible in the UI because the label was previously hard-wired.

---

## 0.4 Rollover cap formula

`budget.py::rollover_cap` (L78-98):

```py
def rollover_cap(classification: int, as_of: Optional[date | str] = None) -> float:
    q = quarterly_budget(classification, as_of)          # base individual quarterly amount
    floor = float(get_value("rollover.floor_aud", ...))  # $1,000
    pct   = float(get_value("rollover.pct", ...))        # 0.10
    return round(max(floor, q * pct), 2)
```

This computes `max($1,000, 0.10 × quarterly_base_individual)` — quarterly base individual is a fixed derivation from the annual `daily_total × 365 × 0.9 / 4`, NOT the days-in-quarter variant the spec references (`0.10 × base_individual_daily × days_in_quarter`).

For most quarters the difference is tiny (a quarter is ~91.25 days out of 365, so `365/4 = 91.25` vs 90/91/92 days per calendar quarter). The T1-T3 acceptance values in the spec use days-in-quarter arithmetic:

- **T1**: class 3, Jan-Mar (90 days) → `$54.16 × 90 = $4,874.40` quarterly base individual → rollover cap $1,000 (floor wins). Current code uses `$54.16 × 91.25 = $4,942.10`, so rollover cap still returns $1,000 (floor wins) — **T1 passes either way**.
- **T2**: class 8, Apr-Jun (91 days) → `$192.59 × 91 = $17,525.69` → 10% = $1,752.57. Current code: `$192.59 × 91.25 = $17,573.83` → 10% = $1,757.38 — **T2 fails by $4.81**.
- **T3**: class 6, Apr-Jun (91 days) → `$118.64 × 91 = $10,796.24` → 10% = $1,079.62. Current code: `$118.64 × 91.25 = $10,825.90` → 10% = $1,082.59 — **T3 fails by $2.97**.

**Fix scope:** `rollover_cap` must accept a `q_start`/`q_end` (or `days_in_quarter`) argument and compute `max(floor, base_individual_daily × days_in_quarter × pct)`, using the CURRENT calendar quarter by default. This is a small change in `budget.py` + wire the current quarter through the endpoint.

---

## 0.5 Contribution field semantics

L211-220 in the tool:

```jsx
<span className="text-sm text-muted-k">Expected annual spend on contributions (optional)</span>
<input value={annualBurn} onChange={(e) => setAnnualBurn(e.target.value)} placeholder="e.g. 1500" ... />
```

State name `annualBurn` is sent as `expected_annual_burn` (L125). Backend uses it ONLY to compute `years_to_cap = remaining_cap / expected_annual_burn` (L3981-3983). It does NOT reduce the funded budget. So the semantics are correct today — but the **label is ambiguous** ("Expected annual spend on contributions") and the results view does not surface an "Estimated annual contribution" line back.

**Fix scope (per T15):** relabel the field to something like "Expected annual out-of-pocket contribution (optional)", make the results view echo the value as a separate line "Estimated annual contribution: $X", and clarify that the funded budget is unchanged. No backend-math change required.

---

## 0.6 Per-stream "indicative" labelling

Present (L317, L328-330): the streams card shows a small chip labelled `Indicative split` when `allocation_source !== "statement"`, and a bottom note "Streams cannot cross-subsidise. Indicative split, your provider's care plan may differ."

BUT: the note is at the BOTTOM of the card, and the label is a small pill. Per F6 it should be a persistent, visible-above-the-fold note ABOVE the per-stream table. Additionally, the intro copy (L170) still says "per-stream allocations" without an indicative qualifier.

---

## 0.7 "Save to profile" clarity

`ProfileInlinePrompts.jsx::SupplementsEditor` submits via `PATCH /api/participants/:pid` with `{applicable_supplements, enteral_feeding_type?}`, persisting to `participants.applicable_supplements` (Mongo). Button text (L367): `"Save to profile"` (or `"Saving…"`).

Toast on save: fires `toast.success(...)` on parent handler via `onSaved` (L83 in ProfileInlinePrompts — verified). BUT the toast copy is generic and doesn't spell out participant name or explain the next-load pre-fill. Fix per F7: change to `"Save to <FirstName>'s profile"` and add explicit toast copy.

---

## Summary of Phase 0 findings

| # | Finding | Status |
|---|---|---|
| F1 | Top card + bottom section are DIFFERENT state atoms with a one-way merge only at profile-save time. **BUG confirmed.** | Fix scope: single-source via participant profile + anonymous fallback. |
| F2 | Bottom section splits enteral into two independent checkboxes; both tickable. **BUG confirmed.** | Fix scope: single "Enteral feeding" checkbox + bolus/non-bolus radios. |
| F3 | Bottom section shows `dementia_cognition` and `eachd_top_up` un-gated. Backend already rejects them via `grandfathered_only` seed (L238, L246). UI-side gate missing. | Fix scope: disable + tooltip; keep the existing backend rejection. |
| F4 | Grandfathered label on L234 shows the correct pair today ($84,571.66 vs $135,318.69), but does not explain the "no-worse-off" nature. Spec asks for expanded copy. | Fix scope: expand label text. |
| F5 | Non-grandfathered cap IS applied ($135,318.69). Results view already renders it. The balance input works in both states — no policy gap. | Fix scope: keep behaviour; add UI clarity on which cap is remaining. |
| F6 | Indicative labelling exists but as a small pill at top of card and a note at bottom. Not persistent-above-the-fold. | Fix scope: promote note to top-of-card and update intro copy. |
| F7 | Save button + toast are generic. | Fix scope: personalise button + toast. |
| F8 | Standard Wayly disclaimer is present via `AIAccuracyBanner` in most tools but the calculator uses `ToolSummary` + `ReportIssueButton` alone and lacks the shared disclosure block. | Fix scope: append `AIAccuracyBanner` at the end of results. |

## Open items requiring Antony's confirmation

1. **Confirm** the non-grandfathered SAH lifetime cap is `$135,318.69` (already seeded in program_reference). **My reading: yes, confirmed by seed.**
2. **Confirm** the Grandfathered checkbox should NOT switch classification daily rates. Current behaviour DOES switch for classes 1-4. Antony's stated intent is "only lifetime cap". **Recommendation:** proceed to remove the rate-switch branch in Phase 1 unless Antony objects.
3. **Confirm** the treatment of participants moving OFF grandfathered (SAH reassessment). Current model has no explicit "moved off" flag — a single boolean.

## Rollover formula acceptance-value drift

Per section 0.4, current code computes `10% × quarterly_base_individual` where quarterly = `annual × 0.9 / 4`. Spec T2/T3 expect `10% × base_individual_daily × days_in_quarter`, which uses actual calendar days per quarter. Small (~$3-$5) numeric drift on T2/T3 unless we switch. **Fix planned in Phase 1.**

---

**Phase 0 gate: audit complete. Awaiting Antony's confirmation on the three open items before executing F1–F8 + T1–T16.**
