# Scenario Engine — Phase 0 Discovery Audit

Status: read-only audit. No code changed. Approval required before Phase 1.

This document is the source of truth for what already exists in the Wayly web repo (`/app/backend` + `/app/frontend`) before the participant scenario capture system is built. The seven discovery items in the prompt are answered in order.

## 1. Current participant data model

Wayly has **two coexisting participant schemas**. Both live in the same Mongo cluster and both are read by various routes. Any new lifecycle field will need to land on the active schema (V2) and be backfilled to the legacy one.

### 1a. Batch 3 (current) — `ParticipantV2`

File: `backend/batch3_models.py:79-103`. Mongo collection: `participants`.

| Field | Type | Notes |
|---|---|---|
| `id` | str (uuid4) | Primary key. Mirrored across collections as `participant_id`. |
| `account_id` | str | Billing/plan boundary (see §5). |
| `household_id` | str \| null | Legacy bridge — populated when migrated from V1. |
| `first_name`, `last_name` | str | Used in the participant switcher and statement decoder context. |
| `date_of_birth` | str (YYYY-MM-DD) \| null | Optional. |
| `classification` | int (1–8) \| null | Support at Home classification 1 through 8. **No transitioned-HCP levels are modelled.** |
| `provider_name`, `provider_id` | str \| null | Free-text provider name + optional FK. |
| `household_email` | str | `dorothy-7a3f@in.wayly.com.au` style inbound address (per-participant inbox). |
| `statement_format` | `"email" / "portal" / "paper" / "unknown"` | How statements arrive. |
| `is_primary` | bool | The first/primary participant on the account. |
| `status` | `"ACTIVE" / "PENDING_REMOVAL" / "REMOVED"` | **The only state-like field in the system today.** 30-day soft-delete window. |
| `removal_requested_at`, `removal_confirmed_at`, `data_purge_scheduled_at`, `data_purged_at` | ISO str | Removal lifecycle timestamps. |
| `notes` | str | Free-text. |
| `color_index` | int 0–4 | Drives the switcher swatch colour. |
| `created_at`, `updated_at` | ISO str | |

There is **no** `lifecycle_state`, no parallel-flag bag, no event log, no transition map, no contribution cohort field, no legal/supporter field, no provider-status field.

### 1b. Batch 2 (legacy, still active in some routes) — `Participant`

File: `backend/batch2_models.py:49-61`. Same collection as V2 but with a different field shape: `name` (single field), `is_grandfathered: bool`, `is_archived: bool`, no `account_id`. Routes in `batch2_routes.py` still read this shape.

This is the only place the **"no worse off" cohort** is partially represented (as the boolean `is_grandfathered`). It is read for lifetime-cap selection in `budget.py::lifetime_cap()`.

### 1c. Account / household envelopes

- `Account` (`batch3_models.py:41-55`) — billing entity owning one or more participants. Carries `base_plan`, `base_plan_status`, trial/Stripe state.
- `Household` (`models.py:70-83`) — legacy 1-household-per-owner shape: `owner_id`, `participant_name`, `classification`, `provider_name`, `is_grandfathered`, `relationship`. Still the source of truth for some downstream calls (audit log, family thread, hospital admissions in `batch2_routes`).
- `AccountMember` (`batch3_models.py:111-124`) — caregiver seats on an account, with optional `participant_access: List[str] | null` (null = all).

### 1d. Hospitalisation / amendments / wall

Each of these has its own collection (`hospital_admissions`, `care_plan_amendments`, `wall_posts`) but none of them mutate a participant state. They are siblings, not state changes.

**Implication for scenario engine:** The new `lifecycle_state` field belongs on `ParticipantV2`. Backfill default = `"ACTIVE"` for every existing row except those with `status = REMOVED` → `EXITED`. The legacy `Participant` mirror in batch 2 routes must be left untouched in shape (additive only).

---

## 2. How statements, budgets and the 8 tools read participant data today

Touch-point inventory. Every place that reads `participant.classification`, `participant.provider_name`, or other program-driven fields is a candidate for the reference-data refactor in Phase 1.

| Surface | File | Reads | Notes |
|---|---|---|---|
| `/api/budget/current` | `server.py:1576-1620` | `(p \|\| h).classification` | Uses `budget_lib.stream_allocations` + `quarterly_budget` + `rollover_cap`. |
| `/api/budget/projected` | `server.py:1659-1690` | classification, provider | |
| Onboarding household create | `server.py:475-490` | classification | Used to seed initial budget calc. |
| Adviser scenario modeller | `batch2_routes.py:680-700` & `batch2_models.py:197-215` | classification, lifetime cap, is_grandfathered | Mirrors `budget.py` figures as a literal dict — duplicate source-of-truth. |
| Statement parser system prompt | `agents.py::PARSER_SYSTEM` (line 65) | none (LLM-side) | |
| Statement chat context (Ask Wayly) | `agents.py::CHAT_SYSTEM_TEMPLATE` (line 104-125) | classification, annual budget, quarterly budget, lifetime cap | **Hard-codes** `${annual:,.0f}` etc. from `CLASSIFICATIONS` dict. |
| Statement decoder anomaly rules | `agents.py::RULE_1_CARE_MGMT_CAP`, `RULE_1B_CARE_MGMT_MONTHLY`, `RULE_9_*`, `RULE_10_*`, `RULE_13_QUARTERLY_UNDERSPEND`, etc. | quarterly budget, rollover floor, 10% care-management cap | All values come from `budget.py` module constants. |
| Tools — Budget Calculator | `frontend/src/pages/tools/BudgetCalculatorTool.jsx:33-40` | annual budget list 1–8 | **Hard-coded in JS.** Duplicate of `budget.py`. |
| Tools — Statement Decoder | `frontend/src/pages/tools/StatementDecoderTool.jsx` | reads `budget/current` response | Indirect. |
| Tools — Contribution Estimator | `frontend/src/pages/tools/ContributionEstimator.jsx` | partial rate tables | Independent literal map. |
| Tools — Classification Self-Check | `frontend/src/pages/tools/ClassificationCheck.jsx` | symptom-to-classification mapping | Heuristic only, no $ figures. |
| Tools — Reassessment Letter | `frontend/src/pages/tools/ReassessmentLetter.jsx` | classification label | Display only. |
| Tools — Price Checker | `frontend/src/pages/tools/PriceCheckerTool.jsx` | static rate band table | Independent literal map. |
| Tools — Care Plan Reviewer | `frontend/src/pages/tools/CarePlanReviewer.jsx` | participant `name`, classification | Display only. |
| Tools — Family Coordinator | `frontend/src/pages/tools/FamilyCoordinator.jsx` | participant list | No $ figures; **this is the surface the prompt recommends reusing for the new event-capture UI.** |
| SAH Levels marketing page | `frontend/src/data/supportAtHomeLevels.js` | annual amount list 1–8 | **Hard-coded.** Third duplicate. |
| Onboarding wizard | `frontend/src/pages/Onboarding.jsx:13-20` | annual amount list 1–8 | **Hard-coded.** Fourth duplicate. |
| Demo / sales page | `frontend/src/pages/Demo.jsx:175` | `135318.69` lifetime cap | **Hard-coded.** |

**Implication for scenario engine:** there are at minimum **5 duplicate copies of the classification budget table** (one canonical in `budget.py`, four duplicates: `batch2_routes.py`, `BudgetCalculatorTool.jsx`, `supportAtHomeLevels.js`, `Onboarding.jsx`) and at least 2 copies of the lifetime cap (`budget.py`, `batch2_routes.py`, plus the literal in `Demo.jsx`). All must be refactored to read through the Phase 1 lookup function.

---

## 3. Existing status / state / lifecycle fields on the participant

Today there is **one** mutable status-like field: `ParticipantV2.status ∈ {ACTIVE, PENDING_REMOVAL, REMOVED}`. It models removal only.

Adjacent state that is *not* on the participant but should feed the new lifecycle:

- `HospitalAdmission.status ∈ {"active", "discharged"}` (`batch2_models.py:96`) — a separate doc per admission, not flagged on the participant. The prompt's `HOSPITALISED` state will need to derive from "has an open `HospitalAdmission`" until the new field exists, then write through.
- `Account.base_plan_status` — billing only.
- `subscription_status` on the user — billing only.

There is **no** trace of `AWAITING_ASSESSMENT`, `INTERIM_FUNDED`, `RESTORATIVE`, `END_OF_LIFE`, `IN_RESPITE`, `OVERSEAS`, `MOVED_TO_RESIDENTIAL`, `DECEASED` anywhere in code, schema, or seed data.

The boolean `is_grandfathered` on the legacy participant model is the closest thing to a contribution-cohort flag, but it is single-bit and conflates "no worse off" with the unspecified rest. The prompt's full flag taxonomy (`NO_WORSE_OFF`, `FULL_PENSIONER`, `PART_PENSIONER`, `CSHC_HOLDER`, `SELF_FUNDED`, `MEANS_NOT_DISCLOSED`, `HARDSHIP_GRANTED`, `LIFETIME_CAP_REACHED`, `TIME_LIMITED_CAP_REACHED`) does not exist.

---

## 4. Current notification / alert mechanism

There are three independent delivery channels. Phase 4 must deliver new alerts through these without introducing a fourth.

### 4a. In-app notifications

- Schema: free-form Mongo docs in `notifications` (no Pydantic model). Fields used: `id`, `user_id`, `category`, `title`, `body`, `link`, `read`, `read_at`, `created_at` (`server.py:3343-3398`).
- Helper: `create_notification(user_id, category, title, body, link)` (`server.py:3343-3358`) checks the user's per-category prefs before inserting.
- Categories: enumerated in `NOTIFICATION_CATEGORIES` and `DEFAULT_NOTIFICATION_PREFS` (not yet read here — search `notification_categor` in `server.py` near line 3382 for the list). Existing categories are statement/budget/family/system flavoured.
- API: `GET /api/notifications`, `POST /api/notifications/read`, `GET/PUT /api/notifications/prefs`, `GET /api/notifications/stream` (Server-Sent Events for real-time bell updates).
- Frontend: `NotificationsBell.jsx` polls + subscribes to SSE.

### 4b. Email

- `email_service.py::_send` is the lone Resend wrapper. Other functions (e.g. `notify_team_contact`) call it.
- Smoke-test alerter (`smoke_status.py::_alert_on_failure`) uses the same `_send` path.
- No participant-event emails yet.

### 4c. Push (mobile / web push)

- `push_service.py` exposes `notify_admin`, `notify_role`, `notify_admin_test`. Currently used **only by the admin surface** (Phase E security alerts). Not yet wired to caregiver users.
- The prompt's rule "push and notification payloads must never contain participant health or financial detail" — easy to honour since push isn't yet on the caregiver path. Phase 4 should add a `notify_user(user_id, title, body, link)` helper with a hard guard that strips/redacts any payload field outside an allowlist before sending.

### 4d. SMS

- `batch2_routes` includes an SMS opt-in scaffold (Twilio behind a feature flag). Verified per phone number. Not currently used for participant alerts.

**Implication for scenario engine:** Phase 4 alerts will be written via `create_notification()` (in-app), with an additive email helper for medium+ severity. SMS path is opt-in and out of scope unless explicitly enabled. Push remains admin-only until Phase 7 (mobile parity).

---

## 5. Household and caregiver-access model

Two-layer model, in flux between V1 and V2.

### 5a. V2 (current, billing-aligned)

```
Account (id, owner_user_id, base_plan, ...)
  └─ AccountMember[]   (account_id, user_id, role ∈ {OWNER, CAREGIVER, VIEWER}, participant_access: uuid[] | null, status)
  └─ ParticipantV2[]   (account_id, household_id?, ...)
  └─ ParticipantAddOn[] (participant_id, status)
```

- Seat limits enforced by `SEAT_LIMITS = {FREE: 1, SOLO: 1, FAMILY: 3, ADVISER: 3, ADVISER_PRO: 9999}` (`batch3_models.py:35`).
- `participant_access` on AccountMember **scopes which participants a non-owner caregiver can see**. `null` ⇒ all.
- Invites: `POST /api/v2/members/invite` (`batch3_routes.py:496`). Email pending → ACTIVE on acceptance.

### 5b. V1 (legacy household, still drives some routes)

- One `Household` per `owner_id`. `users.household_id` joins users to a single household.
- Several routes (audit log, hospital admissions, family thread, wall posts) still write `household_id` on their docs (`batch2_models.py:85, 121`, `server.py:179` `_audit`).

### 5c. Access enforcement

The canonical guard is `security_utils.py::assert_participant_access(user_id, participant_id, require_active)` (line 281).

- Resolves `participant.account_id` and the user's account via owner-or-member membership.
- Falls back to `household_id` matching for legacy docs.
- Raises `ParticipantAccessDenied` → HTTP 404 (note: 404, not 403, to avoid leaking existence).
- Every request that reads `X-Participant-Id` flows through `_resolve_active_participant` → `assert_participant_access` (`server.py:134-156`).

For the scenario engine the new `SAFEGUARDING_ALERT` flag and its event log entries must additionally gate visibility to **OWNER-role members** (not all caregivers). The cleanest hook is a small `assert_participant_safeguarding_access` helper that wraps the existing function and checks `AccountMember.role`.

### 5d. Consent

- The participant themselves does not have a separate account in the current model. The carer is the user.
- No explicit consent record exists for "this participant agreed to share their data with this caregiver." Removing a caregiver removes their `AccountMember` row.
- Consent withdrawal (Phase 0 scenario 9.6) does not have an explicit hook yet — would need a new `consent_withdrawn_at` field on `ParticipantV2` or a new `consent_events` collection.

---

## 6. Existing reference-data approach (the most important audit item for Phase 1)

There is **no** reference-data layer. Every program figure is a Python or JS literal living somewhere in code, with no `effective_from` / `effective_to`.

### 6a. Canonical literals

| File | Constant / Literal | Value | Used for |
|---|---|---|---|
| `backend/budget.py:10-19` | `CLASSIFICATIONS` dict | annual budget for levels 1–8 | All budget math |
| `backend/budget.py:31` | `CARE_MANAGEMENT_DEDUCTION` | 0.10 | Quarterly budget calculation |
| `backend/budget.py:32` | `ROLLOVER_FLOOR` | 1000.0 | Rollover cap |
| `backend/budget.py:35-36` | `LIFETIME_CAP_GRANDFATHERED`, `LIFETIME_CAP_NEW_ENTRANT` | 84571.66, 135318.69 | Lifetime cap selection |
| `backend/budget.py:25-29` | `STREAM_PROPORTIONS` | Clinical 0.40, Independence 0.35, Everyday 0.25 | Stream allocations (acknowledged in code as MVP-default-only) |

### 6b. Duplicate literals to refactor in Phase 1

| File | Duplicate of | Notes |
|---|---|---|
| `backend/batch2_routes.py:687-695` | `CLASSIFICATIONS` + lifetime caps | Adviser scenario modeller reference table. |
| `frontend/src/data/supportAtHomeLevels.js:15-120` | `CLASSIFICATIONS` | Marketing/SAH levels page. |
| `frontend/src/pages/Onboarding.jsx:13-20` | `CLASSIFICATIONS` (subset) | Onboarding picker. |
| `frontend/src/pages/tools/BudgetCalculatorTool.jsx:33-40` | `CLASSIFICATIONS` (subset) | Tool input. |
| `frontend/src/pages/Demo.jsx:175` | `LIFETIME_CAP_NEW_ENTRANT` literal | Marketing hero stat. |
| `backend/tests/fixtures/_robert_q1_decoded.json:21` and `_okafor_decoded.json:21` | Lifetime cap | Test fixtures — these are point-in-time captures of what a real statement said, so should NOT be refactored. |

### 6c. Values **NOT** present anywhere in code (and therefore safe to add fresh in Phase 1)

- 4 transitioned HCP levels and their dollar amounts.
- AT-HM tier figures and 12-month expiry.
- Restorative Care pathway figure (~$6,000 / 16 weeks, +$12,000 with additional unit, 2 episodes/year).
- End-of-Life pathway figure (~$25,000 / 12 weeks, extendable to 16).
- 60% interim funding rule.
- Time-limited (4-year) non-clinical contribution cap.
- Contribution category rates (Clinical 0%, Independence 5–50%, Everyday Living 17.5–80%).
- Indexed cap figures after the 20 March 2026 indexation ($137,917.01 / $86,185.23).

### 6d. Implication

Phase 1 should introduce one collection (or set of collections) like `program_reference (key, value, effective_from, effective_to, source_url, version_note)` and a single `getProgramValue(key, as_of_date) -> value` lookup that every site listed in §6a/6b calls into. The lookup must be cached in-process for hot paths (statement decoder, `/budget/current`) so the rule engine doesn't pay a Mongo round-trip per call. Cache invalidation = process restart, plus a small admin endpoint to flush.

---

## 7. Web / mobile shared-types relationship

- **Two separate repos.** Web at `anto-beep/Wayly-Web-App` (this codebase). Mobile at `anto-beep/mobile-app` (separate, not present in this pod).
- **No shared package today.** No `packages/shared`, no published npm package, no protobuf, no OpenAPI generation that the mobile repo consumes. There IS an OpenAPI document at `/openapi.json` (FastAPI auto-generated) but the mobile app does not yet generate types from it.
- **Type duplication is the status quo.** The new mobile app dashboard prompt (`/app/MOBILE_AGENT_DASHBOARD_PROMPT.md`) prescribes redeclaring the participant shape on the mobile side. Phase 7 of the scenario engine needs to fix that.

**Implication for scenario engine Phase 7:**

Three workable approaches:

1. **OpenAPI as the contract.** Add the new lifecycle states, flags, event taxonomy, and alert shapes to FastAPI Pydantic models with rich `Literal[...]` enums. Mobile uses `openapi-typescript` (or similar) against `/openapi.json` to generate `wayly-api.d.ts`. Pros: no new package boundary; types stay in lockstep with runtime validation. Cons: enums become TypeScript union types only (no runtime list to iterate on mobile).

2. **JSON schema sidecar.** Publish `docs/scenario-schema.json` containing all enums, transition map, axis tagging, and alert types. Both repos `fetch` it at build time. Pros: language-agnostic; supports both Capacitor (TS) and RN. Cons: extra ceremony.

3. **Shared TS package.** Create `packages/wayly-types` with the lifecycle enum, flag enum, axis enum, event-type enum, alert-severity enum. Publish as a private npm package (or use git+ssh dependency). Both repos import. Pros: cleanest DX. Cons: monorepo setup or an external registry.

The prompt asks for "shared types or an API schema." Option 1 (OpenAPI) is the lowest-cost path that uses something we already have running, so that is the recommended Phase 7 approach unless the user picks otherwise.

---

## Findings summary (what the scenario engine has to add, not already present)

| Capability | Status today | Phase that adds it |
|---|---|---|
| Versioned program reference data with point-in-time lookup | ❌ All literals, scattered across ≥5 files | Phase 1 |
| `lifecycle_state` field on participant + transition map | ❌ Only `status` (3-value removal lifecycle) | Phase 2 |
| Parallel flag bag (funding / contribution / legal / provider / cohort) | ❌ Only `is_grandfathered` (single legacy bit) | Phase 2 |
| Audit log on state and flag changes | Partial — `audit_events` collection exists for actions, not participant fields | Phase 2 |
| Restricted visibility on `SAFEGUARDING_ALERT` | ❌ Same visibility as everything else | Phase 2 |
| `participant_event` collection + event-type taxonomy + six "what-changed" axes | ❌ | Phase 3 |
| Caregiver event-capture UI on the Family Coordinator surface | The surface exists at `frontend/src/pages/tools/FamilyCoordinator.jsx`; nothing wired | Phase 3 |
| Scheduled deadline clocks (quarter-end, AT-HM expiry, 28/60-day death, 120-day contribution letter, 56-day referral code, 4-quarter no-service, interim 60%, RC/EoL expiry) | ❌ Some calculations exist as one-shots in budget code but no scheduled evaluation runner | Phase 4 |
| Forward-dated policy gates (1 Oct 2026, 1 Jul 2026, early-2027, CHSP) | ❌ Hard-coded literal date references in `agents.py` and `seed_cms_content.py` | Phase 1 (reference data) + Phase 4 (gate) |
| `advice_boundary` tag on events/alerts (SAFE_TO_EXPLAIN / ROUTE_OUT / ESCALATE) | ❌ | Phase 5 |
| AI guard in Ask Wayly + tool response paths for ROUTE_OUT / ESCALATE topics | ❌ Current `CHAT_SYSTEM_TEMPLATE` mentions route-out implicitly but no enforced guard | Phase 5 |
| Statement decoder → participant event emission | ❌ Anomalies are returned in API responses only; nothing flows into a participant timeline | Phase 6 |
| Participant timeline view | ❌ | Phase 6 |
| Shared contract consumed by mobile | ❌ OpenAPI exists but mobile not generating from it | Phase 7 |

## Open questions for the user before Phase 1

These are the calls that would be more expensive to undo than to settle now. None block Phase 0 approval — but answers locked in here save a refactor in Phase 1–2.

1. **Reference data storage**. Two options:
   - (a) Mongo collection `program_reference` with `{key, value (numeric / json), effective_from, effective_to, source_url, notes}` — flexible, queryable, but requires a one-line read for every lookup (mitigated by an in-process cache).
   - (b) Versioned YAML/JSON file in `backend/reference/` checked into git, loaded at startup. Auditable via PR history. Easier to seed, no Mongo writes. Less flexible if a figure needs to be hot-patched in production without redeploy.
   Recommendation: **(a) Mongo collection + in-process cache + a small admin endpoint to bump a value**, because indexation events (20 March, 20 September, 1 July) will arrive while production is running. The git-history audit need is met by `program_reference_history` mirror writes.

2. **Transition map approval cadence**. The prompt asks me to present the full transition map for review at the end of Phase 2. Would you prefer I draft the full table **before** Phase 1 begins so we lock the spine of the model first, or stick to phase order (Phase 1 reference data → Phase 2 transitions)?

3. **Lifecycle state of removed participants**. The current `status = REMOVED` is the soft-delete tombstone. Should `lifecycle_state = EXITED` map to `status = REMOVED` exactly, or do we want two separate concepts (e.g. a person can be `EXITED` from the program but still kept in the household for record-keeping)? Recommendation: keep them as separate axes — `lifecycle_state = EXITED` is a programme exit, `status = REMOVED` is a Wayly account removal.

4. **Event-source attribution for statement-derived events**. When the decoder fires `RULE_1_CARE_MGMT_CAP` and that becomes a `participant_event`, the event needs a back-reference to the statement and the offending line item. Should that be `source_statement_id + source_line_item_id` (Mongo doc IDs), or a structured `source: {kind: "statement_anomaly", statement_id, line_item_id, rule_key, severity}` payload? Recommendation: the structured payload — it's how the timeline view will render the citation chip.

5. **Notification fan-out across an account**. When an alert is generated for a participant, who gets the in-app notification? Owner only, every active caregiver with `participant_access`, or every caregiver regardless of access? Recommendation: **every caregiver with `participant_access` for that participant**, owner always included.

---

End of Phase 0. Nothing in the repo has changed. Awaiting approval to proceed to **Phase 1: Reference Data and Versioning**, where I will:

1. Create the `program_reference` collection (or chosen alternative) and seed it with every figure listed in §6a.
2. Add `backend/reference/program_values.py::get_program_value(key, as_of_date)` with an in-process cache.
3. Refactor the 5 duplicate sites listed in §6b to read through it.
4. Show the diff and pause for approval again before Phase 2.
