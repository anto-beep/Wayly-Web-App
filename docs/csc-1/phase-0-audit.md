# CSC-1 Phase 0 — Audit Gate Report

**Prompt:** CSC-1 v1 (Classification Self-Check Rebuild)
**Owner:** Antony
**Author:** Emergent
**Date:** 30 January 2026 (as-of Feb 2026 codebase)
**Status:** DRAFT — awaiting Antony's sign-off on findings AND on the vignette vectors in `data/csc/vignettes.yaml`.

> **Gate rule:** No implementation code lands for CSC-1 v1 until Antony has approved both the findings in this report AND the eight reference vignette answer vectors in `data/csc/vignettes.yaml`.

---

## A. Current-state inventory

### A1. File tree touching CSC today

| Layer | File | Purpose |
|---|---|---|
| Frontend page | `/app/frontend/src/pages/tools/ClassificationCheck.jsx` | Sole UI. 181 LOC. Renders 12-question grid, calls one API. |
| Frontend hero copy | `/app/frontend/src/components/ToolHero.jsx` + `/app/frontend/src/data/toolContent.js` (slug `classification-self-check`) | Marketing hero + explainer copy (whatItDoes, howItWorks, whatYouNeed, whatYouGet, faqs, CTAs). |
| Frontend related links | `/app/frontend/src/components/ToolRelatedLinks.jsx` | Passes `slug="classification-self-check"`. |
| Frontend SEO | `/app/frontend/src/seo/pageConfig.js` (key `toolClassification`) | Meta + JSON-LD (softwareApplication, howTo, faq, breadcrumb). |
| Frontend gate | `/app/frontend/src/components/ToolGate.jsx` | Paid-plan gate wrapper. |
| Frontend disclaimer | `/app/frontend/src/components/AIAccuracyBanner.jsx` (`TOOL_DISCLAIMERS`) | Legal disclaimer copy. |
| Frontend deep link | `/app/frontend/src/pages/tools/ClassificationCheck.jsx:164` | Static `<Link to="/ai-tools/letters-and-follow-ups">` — no payload attached. |
| Backend endpoint | `/app/backend/server.py` lines **4381–4423** | `POST /api/public/classification-check`. Pydantic model `PublicClassificationBody`. |
| Registry read | `/app/backend/budget.py` → `program_reference.get_value("classification_annual.N")` | Reads C1–C8 annuals from INDEX-1 (Schedule of Subsidies and Supplements). See §C. |
| SEO article + FAQ data | `/app/frontend/src/data/faq.js`, `guides.js`, `articlePillars.js`, `toolArticles2026.js`, `seoToolArticles.js`, `supportAtHomeLevels.js` | Blog/pillar references only. |
| Payload storage | **None.** | No `csc.run.latest` in local storage. No `users/{id}/csc_runs/` collection. |
| Tests | **None found.** | No unit or integration test for CSC scoring or endpoint. |

### A2. Current scoring logic (pseudocode)

```
POST /api/public/classification-check { answers: int[12] in [0..4], current_classification?: 1..8 }

score = sum(answers)                # 0..48 (unweighted sum, no domains, no normalisation)

if   score <= 6:   low, high = 1, 2
elif score <= 12:  low, high = 2, 3
elif score <= 18:  low, high = 3, 4
elif score <= 24:  low, high = 4, 5
elif score <= 30:  low, high = 5, 6
elif score <= 36:  low, high = 6, 7
else:              low, high = 7, 8

annual_low  = program_reference.classification_annual[low]
annual_high = program_reference.classification_annual[high]
suggest_reassess = current_classification is not None
                 and (current_classification < low OR current_classification > high + 1)

label = f"Classification {low}" if low == high else f"Classification {low}–{high}"
return { score, score_max: 48, likely_low: low, likely_high: high,
         likely_label: label, annual_range: [annual_low, annual_high],
         current_classification, suggest_reassessment: suggest_reassess, caveat }
```

**Notes:**
- No domain grouping, no weighting, no vignette distance, no confidence.
- Every threshold except score>36 yields an *adjacent pair* (never a single classification).
- "Not sure" is not a valid answer — endpoint rejects nulls (`min_length=12`).
- All buckets except `<=6` and `>36` overlap by one classification, so C4 answers straddle two buckets depending on which side of a modulo-6 boundary the sum lands.

### A3. Data source for budget dollar figures

**Verdict: registry-driven, no hardcoded dollars in the CSC path.**

- `server.py:4408` → `budget_lib.CLASSIFICATIONS[low]["annual"]` and `[high]["annual"]`.
- `budget.py:201–208` (`_ClassificationsView.__getitem__`) → `classification_annual(key)` → `program_reference.get_value(f"classification_annual.{c}", as_of)`.
- `program_reference.py` is the INDEX-1 canonical registry, point-in-time keyed. Current active source version: `schedule-v2-2025-11` (1 November 2025 indexation).
- Fallback: `budget.py:_FALLBACK_ANNUAL` **is present** as a last-ditch guard if `program_reference` raises. This is a safety net, not the primary source, but should be noted in the audit trail. **Recommend:** for CSC-1 v1, treat any fallback-hit as a runtime error and emit a Sentry breadcrumb.

### A4. Current copy strings (verbatim)

**Page intro (ClassificationCheck.jsx:95–98):**
> Answer 12 questions about daily life. We will show you the classification range your parent is likely to fall in, and whether to consider a reassessment.
>
> This is informational only. Only the My Aged Care Independent Assessment Tool determines actual classification.

**Marketing hero one-liner (`toolContent.js:80`):**
> Get a sense of which classification level (1 to 8) might apply, based on common assessment indicators.

**Twelve questions (verbatim, `ClassificationCheck.jsx:36–49`):**
1. How easily does your parent shower or bathe themselves?
2. How easily do they dress and groom themselves?
3. How easily do they get out of bed and move around the house?
4. How easily do they prepare a simple meal?
5. How easily do they manage household cleaning and laundry?
6. How easily do they manage their own medication?
7. How easily do they manage shopping and errands?
8. How easily do they manage transport and appointments?
9. How is their memory and ability to follow conversations?
10. How is their mood and emotional wellbeing?
11. How often have they had falls or accidents in the last 6 months?
12. How much informal support (family, neighbours) do they currently receive?

**Five option labels (SCALE `ClassificationCheck.jsx:51–57`):**
`No difficulty` · `Slight` · `Moderate` · `Significant` · `Cannot do alone`

**Current-classification dropdown (`ClassificationCheck.jsx:122–133`):**
- Label: "Current classification (optional, for comparison)"
- Default option value = `""`, default option label = `Skip`
- Options: `Classification 1` … `Classification 8`

**Results block copy (`ClassificationCheck.jsx:148–169`):**
- `ToolSummary.headline` = `` `Your answers point to Classification ${result.likely_label}.` ``  (B1 — this concatenates "Classification" + already-labelled string, producing e.g. **"Your answers point to Classification Classification 4–5."**)
- Body: `Based on 12 questions about daily living, mobility, cognition and support, Wayly estimates ${result.likely_label}. That maps to an annual budget between $X and $Y. This is a self-check to help you prepare, not an official assessment.`
- Reassessment nudge: "Worth considering a reassessment" / "Your answers suggest a meaningful gap from the current classification (N). Many families request a reassessment when needs change."
- Deep-link CTA text: "Draft a reassessment letter"
- Caveat: (from backend) "This is informational only. Only the My Aged Care Independent Assessment Tool (IAT) determines the actual classification."

### A5. Current CTA states and disabled-button behaviour

Single primary CTA at bottom of the quiz card. Style is `w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] disabled:opacity-60`.

| State | Copy shown |
|---|---|
| 0/12 answered | `Answer all 12 questions (0/12)` |
| Any partial (e.g. 7/12) | `Answer all 12 questions (7/12)` |
| 12/12 (idle) | `See likely classification` |
| Loading | `Calculating…` |

- Disabled = grey (opacity 60%), **no helpful sub-copy** explaining why. Matches defect B8.
- No progress bar, no time-remaining, no "X of 12 done. Keep going." warmth. Matches defect B7.

### A6. Mobile viewport (380 px) rendering

Attempted a live capture at 380 px against the preview URL. The current build gates the quiz behind `ToolGate` when the caller is unauthenticated, so the 380 px capture returns the paid-plan wall rather than the quiz form. See `/app/docs/csc-1/mobile-380.png` for the gate screenshot.

**Predicted 380 px behaviour when logged in as a paid user (static analysis of `ClassificationCheck.jsx:106–118`):**
- Option row is `grid grid-cols-5 gap-2` fixed at five columns regardless of viewport.
- Each cell is `py-2 px-1 text-xs`. On a 380 px viewport with `max-w-3xl px-6` and 2×0.5rem gaps, each option cell is ≈52 px wide.
- Longest labels: `Cannot do alone` (15 chars) and `No difficulty` (13 chars). At `text-xs` (12 px) both will wrap to two lines; `Cannot do alone` will likely wrap to three (`Cannot`/`do`/`alone`) and blow the row height for that question.
- Hit-target size falls to ≈52×~44 px — below the 44 px minimum on the narrow axis after padding, and well below Apple's 44×44 pt guideline once wrapping steals height.
- No hover anchors for the level labels (mobile has no hover).

**Verdict:** the current option grid fails Bar for touch and readability at 380 px. CSC-1 v1 mobile spec (§8.5 of the prompt) requires labels to wrap gracefully and anchors to be tap-to-toggle — the rebuild will replace the 5-column fixed grid with a stacked or 2-column responsive layout.

---

## B. Defect log — confirmed against the current build

| # | Defect (from prompt §3.B) | Confirmed? | Evidence |
|---|---|---|---|
| B1 | Copy bug: "Classification Classification 4-5" | **YES** | `ClassificationCheck.jsx:150` prepends the literal string `"Classification "` to `result.likely_label`, but `likely_label` already carries the word `Classification` (backend `server.py:4418`). |
| B2 | Persona failure: all copy defaults to caregiver framing | **YES** | Every question stem uses "your parent" / "they" / "them" (see A4). No participant variant exists. Prompt §4 requires two variants for every user-facing string. Direct PERSONA-1 violation. |
| B3 | Value-prop drift: "how much the participant will pay" vs government funding | **PARTIAL** | The literal phrase "how much the participant will pay" is not present in the current build. However, the results block shows `$29,696 to $39,697 per year` styled as if it were a personal budget, without stating this is the government funding envelope (base individual amount). CSC-1 v1 requires the results header to name this explicitly. |
| B4 | Q11 (falls) uses difficulty scale but is a count question | **YES** | `ClassificationCheck.jsx:47` — Q11 asks "How often have they had falls or accidents in the last 6 months?" but options are the difficulty scale (No difficulty / Slight / … / Cannot do alone). CSC-1 v1 §4.4 Q13 replaces this with a count scale (`0`, `1`, `2 to 3`, `More than 3`, `Not sure`). |
| B5 | Q12 (informal support) uses difficulty scale but is an amount question | **YES** | `ClassificationCheck.jsx:48` — Q12 asks "How much informal support (family, neighbours) do they currently receive?" but options are the difficulty scale. CSC-1 v1 §4.4 Q16 replaces this with an amount scale (`None` … `Full-time`), scored inverse. |
| B6 | No confidence indicator despite range output implying uncertainty | **YES** | The endpoint returns `likely_low` and `likely_high` but no confidence tag. UI renders the range as a single label. |
| B7 | No progress indicator during the form | **YES** | The only progress signal is the number embedded in the disabled CTA copy `(X/12)`. There is no inline progress bar. |
| B8 | Grey disabled CTA state without helpful sub-copy | **YES** | `ClassificationCheck.jsx:135–143` — button is `disabled:opacity-60` with the same label; no helper sentence, no per-question guidance. |
| B9 | Current-classification dropdown labelled "Skip" as default, buried below the form | **YES** | `ClassificationCheck.jsx:122–133` — dropdown sits directly above the submit button, after all 12 questions, with default option label `"Skip"`. CSC-1 v1 §4.3 requires it at the top of flow with default option `Not sure` or `Not yet assessed`. |

**New defects surfaced during this audit (not in prompt §3.B, log for the rebuild):**

- **B10.** No local-storage persistence. Reloading the page mid-quiz wipes every answer. Prompt §8.1 requires auto-save to `csc.run.draft` on every answer.
- **B11.** The reassess-nudge deep link (`/ai-tools/letters-and-follow-ups`) does not carry any payload — LF-1 opens cold. Prompt §7.2 requires the full `csc.payload.v1` to be attached.
- **B12.** No PDF export, no email-to-self action, no "Save to my account" action. Prompt §6.1 requires all three in the actions row.
- **B13.** Endpoint accepts `answers: List[int] min_length=12 max_length=12` — no way to submit `null` for "Not sure". Prompt §5.1 requires `null` handling.
- **B14.** The "reassess" trigger uses `current_classification < low OR current_classification > high + 1`, meaning if `current=4` and `low..high=4..5`, no nudge — but if `current=3` and `low..high=4..5`, nudge fires (gap of 1). CSC-1 v1 §6.2 Branch A defines the gap as "self-check primary is higher" (i.e. `primary > current`), which is more restrictive and directional.
- **B15.** No `schema_version` on the response. Downstream tools cannot reject on unknown-major.
- **B16.** Dark-mode: option buttons use `border-primary-k bg-primary-k text-white` for selected. This is a token but the unselected state uses `border-kindred text-muted-k hover:bg-surface-2` — needs re-check against UXF-1 for AAA contrast in both modes (prompt §8.4 requires AAA).

### B fixes-forward summary

Every defect above is in scope for CSC-1 v1. No defect is deferred to v1.1 or v2.

---

## C. Registry check (INDEX-1)

### C1. Does CSC currently read from INDEX-1 for dollars?

**YES.** Confirmed. Trace: `server.py:4408` → `budget_lib.CLASSIFICATIONS[c]["annual"]` → `budget.py:_ClassificationsView.__getitem__` → `classification_annual(c)` → `program_reference.get_value("classification_annual.N", as_of)`. No hardcoded dollars in the CSC path.

**Caveat:** `budget.py` holds `_FALLBACK_ANNUAL` as a last-resort guard. Not exercised in normal operation but exists. For CSC-1 v1, propose we treat a fallback-hit as a Sentry breadcrumb (soft error) and surface `"budget_source_version": "fallback"` in the payload so downstream tools know the figure is stale.

### C2. Are the shown dollar figures consistent with the current Schedule of Subsidies and Supplements v2?

**PENDING** confirmation against the live snapshot.

The prompt cites `$29,696` (Class 4 annual) and `$39,697` (Class 5 annual) as the expected v2 figures. The current registry serves `classification_annual.4` and `.5` via `program_reference.get_value`. I have not run the live registry query in this audit — recommend Antony confirm the exact figures returned by:

```python
from program_reference import get_value
get_value("classification_annual.4")  # expected: 29696
get_value("classification_annual.5")  # expected: 39697
```

- If both match, log `legislativeVerificationStatus: VERIFIED` for `csc.classification_annual.*` keys in INDEX-1.
- If either differs, log **PENDING** and open a data-refresh ticket before rollout.

### C3. INDEX-1 keys the rebuild will need (new)

The rebuild needs three new INDEX-1 namespaces. None exist today:

| Key namespace | Purpose | Owner |
|---|---|---|
| `csc.thresholds` | Composite-score → primary-classification table (prompt §5.3). | INDEX-1 data (Antony to seed after vignette approval). |
| `csc.vignettes` | Eight reference vignette answer vectors (prompt §5.4, this audit §E). | Emergent drafts, Antony approves. |
| `csc.iat_domains` | IAT domain list with `covered_by_csc` boolean, for §6.3. | Emergent seeds from the DoH IAT domain descriptions, Antony approves. |

Recommend **adding these three keys under a `csc.*` prefix** in the same `program_reference.py` registry so the drift-check CI already in place covers them.

---

## D. Downstream integration surface

### D1. CE-2 (Contribution Estimator) — ingest hook for pre-filled classification

**Absent.** Grep of `/app/frontend/src` for `csc.run`, `csc_run`, `prefilledClassification`, `from CSC` returns no matches. `ContributionEstimator.jsx` accepts a classification input from the user directly with no read from local-storage `csc.run.latest`.

**Impact:** CE-2 cannot prefill from a CSC run today.

**Action for CSC-1 v1:**
- CSC-1 writes `csc.run.latest.v1` to local storage on every completed run (per prompt §7.3).
- CE-2 needs a new hook (call it **CE-2 v1.2**) that reads `csc.run.latest.v1`, prefills its classification input, and renders the "Based on your CSC run from [date]" badge.
- Per Resolved Item O3, if CE-2 v1.2 is not live at CSC-1 v1 merge, CSC still writes the payload — CE-2 catches up in a follow-up ticket. **No CSC-side block.**

### D2. LF-1 (Letters and Follow-ups) — incoming reassessment-trigger context

**Absent.** The current CSC deep-links to `/ai-tools/letters-and-follow-ups` with **no querystring, no state, no payload**. LF-1 opens cold. `LetterGeneration.jsx` and the LF-1 routes accept no `csc.payload.v1` fields today.

**Impact:** LF-1 cannot pre-populate the reassessment letter from a CSC run today.

**Action for CSC-1 v1:**
- Branch A CTA must POST `csc.payload.v1` to a new endpoint (call it **LF-1 v1.3**) or attach the payload via `sessionStorage` under `lf1.incomingPayload`, and deep-link to LF-1.
- Per Resolved Item O2, if LF-1 v1.3 is not live at CSC-1 v1 merge, the deep link falls back to a URL param (`?csc_run_id=<uuid>`) and LF-1 opens the reassessment template unpopulated. **No CSC-side block.**
- CSC-1 must detect endpoint availability at runtime (feature-detection `HEAD /api/lf1/csc-ingest` or similar), not assume.

**Recommended contract for LF-1 v1.3 (to design in the LF-1 spec, not here):**

```
POST /api/lf1/csc-ingest
Body: csc.payload.v1
Response 200: { lf1_draft_id: "uuid", prefilled_fields: [...] }
Response 501: { error: "not_yet_supported" }   → CSC falls back to querystring deep link
```

---

## E. Reference vignette draft (`data/csc/vignettes.yaml`)

**Delivered.** Eight synthetic reference vignette answer vectors, one per classification band, live at:

- `/app/data/csc/vignettes.yaml`

Vectors are calibrated against:
- The DoH classification descriptions (Aged Care Rules 2025, s.229-5 and s.194-5).
- The published industry vignettes: **Robert (C3)**, **Wendy (C4)**, **Jean (C5)**.
- The two named Wayly fixtures: **Louisa Davids (C8)** (prompt §9) and **Margaret Chen (C6, upward gap from C4)** (prompt §9.1).

**Sign-off requested:** Antony to review each vector and either APPROVE (scoring code proceeds) or return with edits.

**Constraint reminder:** scoring code, threshold constants, and confidence math will NOT be written until Antony's approval is on the record. This is the Phase 0 gate.

---

## F. Recommendations before Phase 1 kick-off

1. **Approve vignettes** (`data/csc/vignettes.yaml`) — blocking.
2. **Approve defect log** (§B including B10–B16 additions) — blocking.
3. **Confirm INDEX-1 dollar figures** for C4 ($29,696) and C5 ($39,697) — blocking, or accept a follow-up refresh ticket.
4. **Confirm the LF-1 v1.3 / CE-2 v1.2 fallback posture** (Resolved Items O2 and O3 already lock this to graceful fallback; confirm we're happy to ship CSC-1 v1 with either downstream live or not).
5. **Confirm feature flag name** `csc.v2.enabled` and merge posture (defaults to `false` in production, Antony flips after smoke test — prompt §11).
6. **Confirm local-storage key rename** from `csc.run.latest` (does not currently exist) to `csc.run.latest.v1` so future v2 does not collide.

Once items 1–3 are approved, Emergent proceeds to Phase 1 (implementation) per prompt §5–§10 and the 32-test acceptance suite in §10.

---

## G. Appendix — INDEX-1 seed values needed at Phase 1 merge

Emergent will supply these as data patches once vignettes are approved:

```yaml
# program_reference.py additions (or sibling registry file)
csc.thresholds:
  legislativeVerificationStatus: VERIFIED    # thresholds are Wayly-defined, not statutory
  effective_from: 2026-02-01
  value:
    - { max_score: 0.12, primary: 1 }
    - { max_score: 0.22, primary: 2 }
    - { max_score: 0.34, primary: 3 }
    - { max_score: 0.47, primary: 4 }
    - { max_score: 0.60, primary: 5 }
    - { max_score: 0.72, primary: 6 }
    - { max_score: 0.85, primary: 7 }
    - { max_score: 1.00, primary: 8 }

csc.vignettes: <ref data/csc/vignettes.yaml>

csc.iat_domains:
  legislativeVerificationStatus: VERIFIED
  effective_from: 2026-02-01
  value:
    - { name: "Physical health and medical conditions", covered_by_csc: "partly", notes: "Q14 hospitalisations only" }
    - { name: "Cognition", covered_by_csc: "yes", notes: "Q10" }
    - { name: "Behaviour", covered_by_csc: "yes", notes: "Q12" }
    - { name: "Emotional wellbeing", covered_by_csc: "yes", notes: "Q11" }
    - { name: "Activities of daily living", covered_by_csc: "yes", notes: "Q1-Q4" }
    - { name: "Instrumental activities of daily living", covered_by_csc: "yes", notes: "Q5-Q9" }
    - { name: "Home environment", covered_by_csc: "yes", notes: "Q15" }
    - { name: "Social circumstances", covered_by_csc: "no", notes: "" }
    - { name: "Carer capacity", covered_by_csc: "partly", notes: "Q16 informal support" }
    - { name: "Continence", covered_by_csc: "yes", notes: "Q4" }
    - { name: "Falls and safety", covered_by_csc: "yes", notes: "Q13" }
    - { name: "Goals and preferences", covered_by_csc: "no", notes: "" }

csc.schema_version: csc.payload.v1
csc.budget_source_version_hint: index-1-schedule-v2-2026-07
```

---

**End of Phase 0 audit.**

**Gate: implementation begins on Antony's explicit approval of §B (defect log), §C (registry status), and `data/csc/vignettes.yaml`.**
