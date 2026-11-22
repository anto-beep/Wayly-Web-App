# PC-RECLASS-1 — Phase 0 Audit Gate + Delivery Record (v1)

**Code:** PC-RECLASS-1 · **Date:** 2026-10-02 · **Priority:** P0 (law in force from 01/10/2026)
**Change:** Personal care moves from the **Independence** contribution category to **Clinical
Supports** under Support at Home. The Australian Government fully funds personal care for
approved participants with available funds → **participant share = $0** from 01/10/2026.

This document is the Phase-0 read-only audit (A1–A7) required before implementation, plus the
delivery record for the workstreams and the acceptance-evidence matrix.

---

## Phase 0 audit findings

### A1 — Contribution engine location (is any of it date-aware today?)
The participant-contribution decision for a service line is made in several places; the core is
already date-aware:

- `backend/lib/services_base.py`
  - `effective_contribution_stream(stream, description, as_of_date)` — personal care is
    *Independence* before 2026-10-01 and *Clinical* on/after it. `PERSONAL_CARE_RECLASS_DATE = "2026-10-01"`.
  - `contribution_expected_band(stream, pension_status, as_of_date)` — Clinical/AT-HM/Care-Mgmt → `(0.0, 0.0)`; Independence/Everyday bands sourced from INDEX-1 with effective dating.
- `backend/lib/inv1/c3_rate.py` — C3 rate check; personal-care lines are explicitly owned by C2 and skipped here.
- `backend/lib/inv1/checks.py::check_c2_personal_care_after_oct_2026()` — Invoice Checker C2 flags a personal-care contribution on/after the boundary (by **service date**).
- `backend/lib/dec1_gates.py` GATE 9 — INFO "transition is coming" note only (±window of the boundary).
- `backend/lib/cpr_rules.py` — Care Plan Reviewer "personal_care_placement" rule (Clinical post-cutover, $0 contribution).
- `backend/services/ce2_engine.py::october_2026_split()` — CE-2 forward estimate split (pre vs post Oct).

**Conclusion:** date-awareness exists; the gap was (a) no single explicit INDEX-1 read for the
boundary across all consumers, (b) **no HIGH error flag in the Statement Decoder** when a
post-boundary personal-care line actually *shows* a contribution, and (c) the behaviour was not
behind a single rollout flag.

### A2 — Call-site inventory (reads category mapping / decides a PC contribution)
- `lib/services_base.py:145` `effective_contribution_stream`, `:157` `contribution_expected_band`
- `lib/inv1/checks.py:150` `check_c2_personal_care_after_oct_2026`, registered `:847`
- `lib/inv1/c3_rate.py:182` personal-care handed to C2
- `lib/inv1/extractor.py:123` `ServiceCategory.personal_care` keyword bank
- `lib/dec1_gates.py` GATE 9 (:445) + **new GATE 11** (PC-RECLASS error class)
- `lib/cpr_rules.py:313` personal_care placement
- `services/ce2_engine.py:460` `october_2026_split`, consumed at `:702`

### A3 — INDEX-1 structure (does the registry support effective-dating?)
Two registries, both effective-dated:
- **`backend/data/monetary_constants.yaml`** via `monetary_constants.py` (`get_value(key, as_of)`),
  read by the Invoice Checker's `_index_get`. Holds `policy_date.personal_care_free = 2026-10-01`
  (effective_from 2025-11-01) **with source provenance** (row at line 1935).
- **`program_reference`** (Mongo + in-process cache) via `get_value(key, as_of)`, seeded by
  `seed_program_reference.py` (`policy_date.personal_care_free`, row ~329), read by the decoder.
The service-type→category decision is expressed in code keyed off the INDEX-1 **boundary date**,
not a declarative per-service map. We keep the date as the single INDEX-1 lever (D1).

### A4 — Service-type reconciliation (vs official Support at Home personal-care list)
Official (My Aged Care): showering, continence **support**, dressing, eating, hygiene, assistance
with self-administration of medication. System tagging reconciled:
- Invoice Checker `extractor.py` `personal_care` set **expanded** to add bathing, grooming,
  continence **support/assistance/care**, assistance with eating, feeding assistance,
  self-administration of medication, medication prompting.
- **Clinical stays first** in the keyword bank, so nurse-delivered medication review/management and
  clinical (catheter) continence care remain Clinical — not mis-tagged into personal care.
- Everyday-living continence **consumables** (products/pads) remain Everyday Living.
- Decoder detection uses the same term set via `services_base.is_personal_care_text()`.

### A5 — Fixture inventory (personal-care lines straddling 01/10/2026)
- `tests/fixtures/POST_OCT_2026_November_2026.pdf` (Ivan Kowalski, Southern Cross) — 4 personal-care
  lines dated Nov 2026 each with an **$8.20 contribution** → **the seeded error** (provider not
  repriced). Builder `build_post_oct_2026_v1.py`.
- `tests/test_dec1_v5_archetypes.py` post-oct archetype — Nov 2026 personal-care line, **$0**
  contribution → false-positive control (must NOT flag).
- `tests/inv1/test_checks.py` — C2 cases at 2026-10-05 (flag) and 2026-08-15 (silent).
- Louisa Davids care-plan fixture (`sample_louisa_davids_2026_07.pdf`) + Margaret June-2026 are
  pre-boundary. (Sam Burke / Dorothy Smith exist as decoder/scenario fixtures; pre-boundary.)

### A6 — Clinical-supports budget model
Personal care still **draws on the participant's Support at Home budget**; only the participant
share goes to $0 (decision 6). CE-2 `category_breakdown` shows Clinical with a positive
`budget_annual` and `you=0` (budget consumed, $0 share). No "off-budget" treatment. Verified by test.

### A7 — Authoritative provenance
INDEX-1 row `policy_date.personal_care_free` carries: *"Announced 22 April 2026 by Aged Care
Minister Sam Rae. Personal care moves from Independence to Clinical Supports, zero contribution
from 1 October 2026."* `source_url = health.gov.au/our-work/support-at-home`. Consumer article
(`frontend/src/data/seoArticles2026.js`) cites the same, with the service definition and the
$1bn/4yr costing.

---

## Locked decisions — status
| ID | Decision | Status |
|----|----------|--------|
| D1 | Effective-dated in the single source of truth, not a per-tool $0 | ✅ all consumers read INDEX-1 `policy_date.personal_care_free` |
| D2 | Boundary by **service delivery date**, never issue/processing date | ✅ decoder GATE 11 + C2 + engine all test the line's service date |
| D3 | Reconcile the PC service-type set to the official list | ✅ extractor + `is_personal_care_text` expanded; clinical/consumables protected |
| D4 | $0 share is the **computed** Clinical-rule outcome, not a literal | ✅ `expected_personal_care_participant_share()` derives 0.0 |
| D5 | New error class detected by Decoder **and** Invoice Checker | ✅ `RULE_PC_RECLASS_CONTRIB` (decoder) + C2 (invoice) |
| D6 | PC still consumes the SAH budget; only the share is $0 | ✅ CE-2 budget model asserted |
| D7 | Feature flag + rollback + route-parity | ✅ `pc_reclass_2026_10` (rollback = `=0`); gates shared across both decoder UI pathways |

## Workstream delivery
- **WS-A** (source of truth): single INDEX-1 boundary key; consumers unified; scheduled-change copy corrected.
- **WS-B** (date-aware engine): `services_base` helpers `pc_reclass_enabled`, `personal_care_fully_funded_from`, `personal_care_is_fully_funded`, `expected_personal_care_participant_share`, `is_personal_care_text`.
- **WS-C** (Statement Decoder): `dec1_gates` GATE 11 → HIGH `RULE_PC_RECLASS_CONTRIB`. Runs inside `agents._add_parse_warnings` → the persisted `audit.anomalies` is shared by BOTH decoder UI pathways (fresh run + saved statement) and by web + mobile `DecoderResultView`, so output is identical across routes/surfaces.
- **WS-D** (Invoice Checker): C2 now reads INDEX-1 and is gated by the flag (rollback-correct).
- **WS-E** (CE-2 / Budget / QP-1): CE-2 `october_2026_split` already excludes the PC sub-share post-Oct; budget consumption preserved (D6). Asserted by test.
- **WS-F** (Ask Wayly / CPR-1 / LF-1): CPR-1 placement rule present; Ask Wayly system prompt now carries the authoritative boundary fact; LF-1 drafts a correction letter via the existing finding→letter path from the new flag.
- **WS-G** (fixtures + answer keys): POST_OCT fixture re-designated the seeded error; new `tests/test_pc_reclass_iter362.py` proves seeded error caught + controls clean + rollback.
- **WS-H** (content/SEO): consumer FAQ + dedicated SEO article already accurate; scheduled-change summary corrected. Remaining content-ops (dateModified bump + IndexNow submit) tracked as follow-up.

## Acceptance evidence
- `pytest tests/test_pc_reclass_iter362.py` → WS-A/B/C/D/E + rollback (all green).
- `pytest tests/inv1/test_checks.py` → C2 boundary cases (green).
- `pytest tests/test_dec1_v5_archetypes.py tests/test_sderrc_golden.py tests/test_dec1_gates.py tests/test_ce2_engine.py` → no regression (green).
- Grep proof: no hardcoded `$0` participant literal in consumers; the share is derived in `services_base`.

## Feature flag & rollout
`pc_reclass_2026_10` — **code default ON** (law in force; existing related checks already shipped),
set in `backend/.env` for staging/preview. **Rollback:** set `pc_reclass_2026_10=0` → reverts to
pre-boundary behaviour (post-01/10/2026 personal care treated as contributory; GATE 11 + C2 silent).

## Solicitor gates
1. General statement of the change — factual reporting from a government source (low risk).
2. LF-1 correction letter — asserts a specific charge is likely an error and asks for correction.
3. The automated error-flag — an automated assessment of a provider charge (advisory, "ask your provider").
