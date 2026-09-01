# BUD-1 v1 Source References

**Purpose:** audit trail for every monetary constant / rule used in the Budget Calculator.
**Owner:** Antony · **Last full review:** 2026-02-08 (E1 · BUD-1 v1 Phase 1) · **Next review:** 2026-09-20 (indexation).

Every entry below is the record of what was verified, where it was verified against, and when the next indexation review is due. When any of these numbers change, add a new row rather than editing the old one so the audit trail is preserved.

---

## Lifetime caps on participant contributions

| Constant key | Current value | Effective | Next review | Source | Verified by | Verified on |
|---|---|---|---|---|---|---|
| `lifetime_cap.standard` (SAH non-grandfathered) | $135,318.69 | 2025-09-20 → 2026-03-19 | 2026-03-20 | [My Aged Care · Contributions changes](https://www.myagedcare.gov.au/changes-contributions-while-accessing-support-home) | Antony | 2025-11-01 |
| `lifetime_cap.standard` (SAH non-grandfathered) | **$137,917.01** | **2026-03-20 →** | 2026-09-20 | Same source + Statura Care industry summary (20 March 2026 indexation). Aged Care Act 2024, no-worse-off transitional provisions. | Antony | 2026-02-08 |
| `lifetime_cap.no_worse_off` (HCP grandfathered) | $84,571.66 | 2025-09-20 → 2026-03-19 | 2026-03-20 | Same source | Antony | 2025-11-01 |
| `lifetime_cap.no_worse_off` (HCP grandfathered) | **$86,185.23** | **2026-03-20 →** | 2026-09-20 | Same source | Antony | 2026-02-08 |

**Indexation schedule:** twice yearly, 20 March and 20 September, by Services Australia (CPI + wages methodology).

---

## Care management deduction

| Constant key | Value | Applies to | Source |
|---|---|---|---|
| `care_management.cap_pct` | 10% | Both ongoing SAH and HCP transitional participants (Rev A section 2.2 — confirmed universal via Silverchain, Just Better Care, Absolute Care & Health, Dulcie Home Care, Home Care Assistance, GIHC). | Aged Care Rules 2025 s.198-5; provider guidance PDFs listed above. |

---

## Rollover cap

Formula: `max($1,000, base_individual_daily × days_in_quarter × 10%)`.

| Constant key | Value | Source |
|---|---|---|
| `rollover.floor_aud` | $1,000 | Aged Care Rules 2025 s.193-5 |
| `rollover.pct` | 10% | Same |

**Applies to** both ongoing SAH and HCP transitional participants (Rev A section 2.3 confirmed via Silverchain, Absolute Care & Health).

`days_in_quarter` is derived from the current Support at Home calendar quarter (Jan-Mar 90, Apr-Jun 91, Jul-Sep 91, Oct-Dec 92).

---

## Classification annual rates (ongoing SAH)

Values as at 1 November 2025 (unchanged since commencement of the Support at Home programme). Next review: with the 1 October 2026 personal care funding change or the September 2026 indexation review, whichever lands first.

| Class | Annual $ (participant base individual + provider) | Source |
|---|---|---|
| 1 | $10,272 | DoH Schedule of Subsidies and Supplements, effective 1 Nov 2025 |
| 2 | $16,034 | Same |
| 3 | $21,966 | Same |
| 4 | $29,696 | Same |
| 5 | $39,697 | Same |
| 6 | $48,114 | Same |
| 7 | $58,148 | Same |
| 8 | $78,106 | Same |

---

## Supplements (participant-side)

| Value | Rate | Applies | Source |
|---|---|---|---|
| Oxygen | $14.66/day | All SAH | Aged Care Rules 2025 s.196-15 |
| Enteral feeding (bolus) | $23.25/day | All SAH | s.196-20 |
| Enteral feeding (non-bolus) | $26.11/day | All SAH | s.196-20 |
| Veterans' | 11.5% of base individual daily | DVA card | s.196-30 |
| Dementia & cognition | 11.5% of base individual daily | **Grandfathered HCP only** | s.196-35 read with transitional provisions |
| EACHD top-up | $3.45/day | **Grandfathered HCP only** | Transitional provisions (HCP legacy top-up) |

Enteral bolus vs non-bolus is mutually exclusive per participant. The UI enforces this via a single "Enteral feeding" checkbox with a bolus/non-bolus radio (BUD-1 v1 F2 fix).

---

## Open items lifted to backlog

- **`BUD-P2-01`** — Grandfathered-off-after-reassessment: current model has one boolean `is_grandfathered`. When a grandfathered participant is reassessed and moves off HCP legacy protection, we need to preserve historic cap contributions and drop grandfathered-only supplement eligibility. Not in Phase 1 scope.
- **`BUD-P2-05` → lifted into `INDEX-1`** — scheduled indexation review. Every 20 March and 20 September, verify every indexed constant against My Aged Care and the DoH Schedule of Subsidies and Supplements. See `/app/docs/audits/INDEX-1-audit.md`.

---

## Change log for this file

- **2026-02-08 (E1, BUD-1 v1 Phase 1)** — created; recorded pre and post 20 March 2026 lifetime cap values; documented rollover formula alignment to days-in-quarter; carried forward the classification annuals; captured supplement rates and grandfathered-only flags. Removed `BUD-P2-02` / `BUD-P2-03` / `BUD-P2-04` per Rev A resolution.
