# INV-1 v1.2 · Phase 1 · C3 rate-logic design

**Status:** ✅ APPROVED (Feb 2026, user sign-off). All 5 open items accepted as recommended in §Open items. Implementation live at `lib/inv1/c3_rate.py` with 12 vignette tests passing.
**Author:** Emergent (agent)
**Date:** Feb 2026 · approved Feb 2026
**Source spec:** [`INV-1-v1.2-Invoice-Checker-handoff.md`](https://customer-assets-jt897jd0.emergentagent.net/job_aged-care-os/artifacts/y6k2zjb4_INV-1-v1.2-Invoice-Checker-handoff.md) §7 §8 §11
**Related documents:** [`/app/docs/inv-1/phase-0-audit.md`](./phase-0-audit.md), CSC-1 vignette-vector gate.

C3 is the check that asks: **is the contribution rate this provider is billing the same as the rate we would expect for this participant, given their situation and the program rules?** Rate-logic is the single most complex piece of the checks engine because "the expected rate" depends on five interacting inputs (pension status, grandfathering, hardship, assessment-pending, service stream). This document defines the expected-rate matrix, the confidence tiering, the caveats and the tier-mapping rules before a line of C3 code is written.

---

## Summary

- **Every C3 finding is a range-comparison, not an equality.** The expected rate can be a single number or a `[min, max]` range depending on how many inputs are missing or unconfirmed. When ranges are used, the observed rate must fall *outside* the expected range for a finding to fire.
- **Confidence is per-finding, not per-run.** A finding with all five inputs confirmed emits `confidence: high`. Missing or `unknown` inputs step confidence down (`medium`, `low`) and, at `low`, the tier is capped at Tier 2 ("worth noting") so the tool does not push the user to raise a question it might be wrong about.
- **Grandfathering is protective, not punitive.** A "no worse off" flag can only lower the expected contribution, never raise it. If a grandfathered participant is billed *below* their protected floor, C3 stays silent.
- **Hardship overrides the base rate.** A confirmed hardship arrangement zero-rates all care and package management contributions until the arrangement expires. C3 flags any non-zero contribution during an active hardship window as Tier 4.
- **Assessment-pending is silence, not evidence.** When a reassessment letter has been sent but no new classification has arrived, C3 uses the *current* classification's rate and adds a caveat to every finding ("your reassessment may change this"). It does not attempt to guess the new rate.
- **Every C3 finding carries the effective-date of the rule and the source of the expected rate**, so the user (and their provider) can verify against the primary source.

---

## 1. Inputs used by C3

C3 reads from six sources. Any that are missing or `unknown` step the confidence down and are called out on the finding's caveat.

| Input | Source | Required for `high` confidence? |
|---|---|---|
| `pension_status` (`full_pensioner \| part_pensioner \| cshc \| self_funded_no_cshc`) | Participant profile → CE-2 → situation step | Yes |
| `grandfathered` (`yes \| no \| unknown`) | Participant profile → situation step | Yes |
| `hardship` (`yes \| no \| unknown`) + hardship start/end dates | Situation step (new field) | If the invoice period overlaps a hardship window, the window itself must be confirmed |
| `assessment_pending` (`yes \| no \| unknown`) + `assessment_letter_date` | Situation step (new field) | Yes |
| Line service stream (`independence \| everyday_living \| clinical \| personal_care \| care_management`) | Extractor (WS2) | Yes |
| Rates registry (`ce2.independence_rate.*`, `ce2.everyday_living_rate.*`) | INDEX-1 | Always |

**Means information** (income, assets) is used for the CE-2 rate *derivation*, not for C3 directly. C3 uses the CE-2 output. If no CE-2 estimate exists, C3 falls back to the pension-status-only rate band from §11 of the spec.

---

## 2. Expected-rate matrix (v1)

Rates below are placeholders that reference INDEX-1 keys, not the actual values. INDEX-1 Deploy 1b is the source of every number at check time.

### 2.1 Independence stream (personal care, domestic assistance, transport)

| Pension status | Grandfathered? | Expected rate | INDEX-1 key |
|---|---|---|---|
| Full pensioner | Yes | protected rate | `ce2.independence_rate.grandfathered_full_pension` |
| Full pensioner | No | full-pension rate | `ce2.independence_rate.full_pension` |
| Part pensioner | Yes | protected rate | `ce2.independence_rate.grandfathered_part_pension` |
| Part pensioner | No | part-pension rate | `ce2.independence_rate.part_pension` |
| CSHC | Yes | protected rate | `ce2.independence_rate.grandfathered_cshc` |
| CSHC | No | CSHC rate | `ce2.independence_rate.cshc` |
| Self-funded no CSHC | Yes | protected rate | `ce2.independence_rate.grandfathered_self_funded` |
| Self-funded no CSHC | No | self-funded rate | `ce2.independence_rate.self_funded` |
| Anything | Unknown | pension_status rate ± 5 percentage-point range | derived |
| Unknown | — | 0 % to `ce2.independence_rate.self_funded` range | derived |

### 2.2 Everyday-living stream (nursing consumables, transport add-ons, cleaning products)

Everyday-living has a **higher** contribution rate than independence for every pension status. Same matrix shape, INDEX-1 keys prefixed `ce2.everyday_living_rate.*`.

### 2.3 Clinical stream

**Expected rate is always 0%.** This is C1's territory, not C3's. C3 emits no finding for clinical lines.

### 2.4 Personal-care stream

**Before 1 October 2026:** treated as an independence-stream line.
**From 1 October 2026:** expected rate is always 0%. This is C2's territory, not C3's.
C3 emits no finding for personal-care lines on or after 1 Oct 2026 (C2 handles them). Before that date, personal-care is folded into independence.

### 2.5 Care management

**Expected rate:** the flat `care_management.cap_pct` from INDEX-1, applied to the *care-management line only*. C3 does not flag care management — C4 does. C3 skips these lines.

---

## 3. Grandfathering as a protective floor

`grandfathered: yes` puts the participant under "no worse off" protection: the government guarantees they cannot pay *more* than they would have under the pre-Support-at-Home program.

**Rule:** the protected rate is a floor, not a fixed value.

- If observed rate ≤ protected rate → **no finding**, regardless of what the current program would say.
- If observed rate > protected rate → C3 emits a finding at the current program's rate as the expected value, with the grandfathered floor in the caveat.

**Silence rule:** a grandfathered participant billed *below* the protected rate never triggers C3, even if the current program's rate is higher. That is exactly what "no worse off" is supposed to do.

**Grandfathering unknown:** C3 uses the current program's rate but adds a caveat: "If your care was arranged before 12 September 2024, you may be on a lower protected rate. Ask your provider to confirm." Confidence steps down to `medium`.

---

## 4. Hardship override

Hardship is a formal government-approved arrangement that zero-rates a participant's care and package-management contributions for a bounded period.

Fields:
- `hardship`: `yes | no | unknown`
- `hardship_start_date`: ISO date (situation step)
- `hardship_end_date`: ISO date, nullable

**Rule:** for any invoice line whose `service_date` falls within `[hardship_start_date, hardship_end_date]` (or `[start, ∞)` when end is null), expected rate is **0%**.

**Tier mapping:** if a non-zero contribution appears during an active hardship window, C3 emits **Tier 4** ("check before you pay") with escalation to ACQSC on 1800 951 822, because this is a clear regulatory breach.

**Missing hardship dates:** if `hardship: yes` but dates are missing or `unknown`, C3 cannot decide whether a line is in-window. It emits **Tier 2** with a caveat and does not escalate to Tier 4.

---

## 5. Assessment-pending caveat

A reassessment can change the participant's classification and therefore their expected rate. Wayly must not guess the new rate.

**Rule:** when `assessment_pending: yes` and the `assessment_letter_date` is within the invoice period (or the last 60 days), C3 continues to use the **current** classification's rate but appends a fixed caveat string to every finding:

> "You have a reassessment pending. Your expected rate may change once the new classification is finalised. This finding is based on your current classification."

**Tier mapping:** unchanged — Tier 3 or Tier 4 as normal. The caveat is additive, not tier-lowering.

**Missing letter date:** if `assessment_pending: yes` but `assessment_letter_date` is `unknown`, C3 still adds the caveat (defensive) and steps confidence to `medium`.

---

## 6. Confidence tiering

`confidence` is emitted per finding and drives both the UX ("we are less sure about this one") and the tier cap.

| Confidence | Preconditions | Tier cap |
|---|---|---|
| `high`   | All five inputs confirmed. Rate registry has an entry with an `effective_from` covering the invoice period. | Tier 4 uncapped |
| `medium` | One input `unknown` OR the invoice period spans a rate-schedule boundary (e.g. an FY change) OR grandfathering is `unknown`. | Tier 3 |
| `low`    | Two or more inputs `unknown` OR the observed rate falls just outside the expected range (< 1 percentage point over) OR the extractor read the rate at `read_confidence < 0.8`. | Tier 2 |

**A finding never fires at Tier 4 when confidence is `low`.** This is the "don't scare the user with something we might be wrong about" principle from spec §8.

---

## 7. Range-comparison rule

When the expected rate is a range `[min, max]`:

- Observed inside the range → **no finding**.
- Observed above `max` → finding, `observed - max` as the delta.
- Observed below `min` **and** the participant is not grandfathered → finding at Tier 2 ("your provider is charging less than we expected — check that this is correct, they may have applied a discount"), confidence steps to `medium`.
- Observed below `min` **and** the participant is grandfathered → no finding (per §3 silence rule).

The "under-charged" branch fires at Tier 2 only because it is protective for the participant — a lower rate is not harm, but the participant should know so they can plan.

---

## 8. Tier mapping rules (summary)

| Trigger | Tier | Confidence cap |
|---|---|---|
| Hardship active, non-zero contribution billed | 4 | — (special case) |
| Rate above expected by ≥ 5 percentage points | 4 if `high`, else 3 | — |
| Rate above expected by 1–5 percentage points | 3 | — |
| Rate above expected by < 1 percentage point | 2 | capped |
| Rate below expected, not grandfathered | 2 | capped at `medium` |
| Rate matches expected within range | none | — |

---

## 9. Caveat copy library

Every finding surfaces a caveat where relevant. Solicitor-approved wording:

- **Grandfathering unknown:** "If your care was arranged before 12 September 2024, you may be on a lower protected rate. Ask your provider to confirm."
- **Assessment pending:** "You have a reassessment pending. Your expected rate may change once the new classification is finalised. This finding is based on your current classification."
- **Rate schedule crossover:** "This invoice period spans a rate-schedule change (from {date}). If your service was delivered before the change, your expected rate may be different."
- **Confidence low (extractor):** "We were not fully sure we read the rate on this line correctly. Please check the invoice against this finding."
- **Under-charged:** "Your provider is charging less than the standard rate. This might be a discount or an error. Consider confirming with them."

---

## 10. Test vignettes (spec §14 · WS4b · pre-launch discipline)

C3 code cannot ship until it passes these vignettes end-to-end. Every vignette produces a fixed expected payload; the tests assert exact equality on `tier`, `confidence`, `expected_source` and `narrative` (case-insensitive).

- **V1: Full pensioner, no grandfather, no hardship, no reassessment, standard independence rate.** Expect: no finding.
- **V2: Full pensioner, no grandfather, independence rate billed at 5 pp above expected.** Expect: Tier 4, confidence high.
- **V3: Grandfathered full pensioner billed at current-program rate, above their protected floor.** Expect: Tier 3, confidence high, caveat mentions grandfathering.
- **V4: Grandfathered full pensioner billed *below* the protected floor.** Expect: silence (no finding).
- **V5: Full pensioner, hardship active, personal-care contribution billed at 5%.** Expect: Tier 4, confidence high, escalation to ACQSC.
- **V6: Full pensioner, hardship `yes` but dates unknown.** Expect: Tier 2, confidence low, no ACQSC escalation.
- **V7: Assessment pending, current-classification rate over-charged by 3 pp.** Expect: Tier 3, confidence medium, reassessment caveat present.
- **V8: Grandfathering unknown, rate over-charged.** Expect: Tier 3, confidence medium, grandfathering caveat present.
- **V9: Observed rate 0.5 pp above expected.** Expect: Tier 2, confidence capped low.
- **V10: Extractor reports `read_confidence: 0.6` on the rate line.** Expect: Tier 2, confidence low, extractor caveat present.
- **V11: Rate observed inside a `[min, max]` range (pension_status unknown).** Expect: silence.
- **V12: Invoice period spans an FY change with different rates on each side.** Expect: finding fires only if the observed rate is outside the higher of the two ranges; caveat mentions crossover.

Every vignette lives at `backend/tests/inv1/vignettes/c3/vignette_{n}.json` and is run by a single parameterised test in `backend/tests/inv1/test_c3_engine.py`.

---

## 11. Non-goals for v1

- **CSHC ranges from means information.** CE-2 already handles this. C3 consumes the CE-2 output; it does not derive rates from raw means information.
- **Provider-specific rate exceptions.** If a provider has a bilaterally negotiated lower rate, it will look like an "under-charged" Tier 2 finding. That is acceptable: the tool is honest ("this is below what we expected"), and the participant can confirm with the provider.
- **Retroactive rate changes.** If a rate changes on 1 July but the invoice covers 15 June–15 July, the tool uses the rate active on the earlier date and adds the crossover caveat. Proration is a v2 problem.
- **International or bulk-billed sites.** Out of scope.

---

## Open items for sign-off (blocks C3 code)

1. **Confidence table** in §6 — accept the three levels (`high`/`medium`/`low`) and the Tier 4 lockout at `low`. Alternative: use PPC's five-level confidence. Recommendation: three levels, matches DEC-1 and CSC-1.
2. **Range-comparison rule** in §7 — approve the "1 percentage point" threshold for "just outside" (Tier 2, capped). Alternative: 0.5 pp. Recommendation: 1 pp, matches DEC-1's Tier 2 threshold.
3. **Under-charged finding** in §7 — approve emitting a Tier 2 finding when observed rate is below expected. Alternative: silence. Recommendation: Tier 2, participants want to know.
4. **Caveat copy library** in §9 — ✅ Solicitor sign-off received. All four verdict banners and the ADM disclosure copy are approved and live; the "solicitor review pending" flag has been dropped.
5. **Vignette catalogue** in §10 — approve V1..V12 as the pre-launch gate. Additional vignettes can be added by the reviewer.

Once the above five items are signed off, C3 implementation can start on WS4 in parallel with C1/C2/C4/C5/C7/C8/C9/C10/C11/C12 (which have no rate-logic dependency).

---

*End of Phase 1 C3 rate-logic design.*
