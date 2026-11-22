# LF-1 v1.2 Phase 0 Audit

**Date:** 2026-02-10
**Status:** Draft — for Antony's sign-off
**Spec reference:** LF-1 v1.2 §Phase 0 Audit Deliverable (21-item checklist)

Iteration 1 has landed (situation triage front door, recipient directory,
correspondence log CRUD, rename cascade, feature-flag scaffolding). This
audit answers all 21 Phase 0 questions so Iterations 2-4 can proceed.

---

## 1. Current RLG-1 state audit

### Existing tool: `ReassessmentLetter.jsx`
- Single-page frontend at `/ai-tools/reassessment-letter`.
- 238 LOC. Three letter types: reassessment, care-plan amendment, CHSP-to-SAH transition.
- Public endpoint `POST /api/public/reassessment-letter` at `server.py:4457`. No auth required beyond `require_paid_plan`.
- Retention: **none**. Each session recomputes silently. No historical draft data to migrate — confirming Antony's answer #3 (no migration needed).
- Known gaps: no follow-up tracking, no correspondence log, no cross-tool imports, no elder abuse pathway, no PostHog analytics.

## 2. Situation-to-archetype mapping — CONFIRMED
Twelve situations map to seven archetypes per the spec table §Situation-to-Archetype Mapping. Codified in `/app/backend/lib/lf1.py::SITUATIONS`.

## 3. Recipient directory
Ten seed records loaded from `/app/backend/data/lf1/recipient_directory.yaml`:
MAC, ACQSC, Complaints Commissioner, Ombudsman, OPAN, OPAN ATSI, 1800ELDERHelp, Police 000, Services Australia Aged Care, Public Advocate (state-specific).
Every record carries `citation_source`, `citation_date`, and phone/URL that were manually verified against `.gov.au` sources on 2026-02-10.

## 4. Correspondence log data model — SHIPPED (Iteration 1)
See `/app/backend/routes/lf1.py::CreateCorrespondenceBody`. All 27 spec fields present (id, participant_id, direction, archetype, situation_id, situation_label, recipient_type, recipient_specific, sender_identity, sender_authority_basis, complaint_mode, atsi_preference, content_draft, content_final, draft_versions, output_formats_generated, status, sent_at, sent_via, expected_response_by, follow_up_date, response_received_at, response_summary, next_action_suggested, source_import, intake, shared_with, sign_off_required, sign_off_by, sign_off_at, replies_to, inbound_source, inbound_received_at, feedback, terms_ack, created_at, updated_at).

Retention: **5 years from last activity** per locked decision #19. Deletion audit record preserved to `lf1_deletions` collection.

## 5. Cross-tool integration surface — READY FOR ITERATION 3
- Statement Decoder → line items available via `/api/statements/recent-line-items` (already used by PPC v2). No additional fields needed.
- Classification Self-Check → participant classification stored on `participant_profile` (via `/api/tools/classification-check/latest` pattern from CPR-1).
- Care Plan Reviewer → sections + findings available via `/api/care-plans/{id}` (already exposed).
- Contribution Estimator → state read via `/api/tools/ce/state` (added in PPC v2 Iter 2).
- Provider Price Checker → saved checks + rate-change flag via `/api/ppc/checks/history` (added in PPC v2 Iter 4).

Iteration 3 wires `source_import: {tool, record_id}` into the correspondence log on cross-tool CTA click.

## 6. Statement of Rights citation library — SCOPE LOCKED FOR ITERATION 2
Sources:
- Aged Care Act 2024 (Cth) — <https://www.legislation.gov.au/C2024A00082/asmade/text>
- Aged Care Rules 2025 F2025L01173 — <https://www.legislation.gov.au/F2025L01173/latest/text>
- Statement of Rights (Schedule 1 of the Act)
- Support at Home program guidelines
- Schedule of Subsidies and Supplements v2 (effective 1 November 2025)

Coverage matrix per archetype defined in Iteration 2 delivery.

## 7. Elder abuse pathway safety review
Copy at `/app/backend/lib/lf1.py::ELDER_ABUSE_SAFETY_COPY`. Phone-first triage with 1800ELDERHelp (1800 353 374), OPAN (1800 700 600), and Police 000.

Letter option is gated behind an explicit "I still want to build a written record" confirmation and framed as a **structured safeguarding record**, not a persuasion letter.

Per Antony's answer #4: shipping enabled with disclaimer copy; iterate wording after OPAN/1800RESPECT review.

## 8. Privacy Policy amendment
The correspondence log is a new persistent personal-data category. Draft amendment lives at `/app/frontend/src/pages/legal/PrivacyPPCAggregate.jsx` (PPC-1 v2 shipped) — LF-1 amendment to follow the same pattern in Iteration 4. Solicitor sign-off gate applies before public launch.

Automated Decision Making disclosure applies. Placement: LF-1 tool surface + on every generated letter (shared `ADMDisclosure` component from PPC v2).

## 9. Migration plan for existing RLG-1 draft data
**Confirmed with Antony (answer #3):** no persistent RLG-1 draft table. No migration needed. `/ai-tools/reassessment-letter` 301-redirects to `/ai-tools/letters-and-follow-ups` from Iteration 1.

## 10. Feature flag plan and rollback plan
- `lf1_enabled` (currently default off — flip in DB to enable) — not gate-blocking Iteration 1 rollout because the rename cascade needs to ship together.
- `lf1_tone_check` — feature-flag gates the tone-check prompt on Escalation/Complaint output (Iteration 3).
- `lf1_elder_abuse_pathway` — per Antony's answer #4, shipping enabled by default. Flag exists for emergency rollback.

**Rollback:** RLG-1 route retained as a lazy import; the 301 redirect can be removed and the direct route restored via a single App.js edit. Recipient YAML is versioned; correspondence log entries are user-scoped and never cross-users, so a data-model change would only need a per-user schema migration (not a mass move).

## 11. Fixture consistency check — DONE (Iteration 1)
Louisa Davids Classification 8 with Glorious Services Pty Ltd is now the canonical fixture across LF-1 AND CPR-1. Fixture file `/app/backend/tests/fixtures/care_plans/build_sample_louisa_davids_2026_07.py` updated (was Class 5 / Better Care at Home Services). PDF regenerated. Test assertions in `test_cpr1_ingestion.py` and `test_cpr1_endpoints.py` updated. No residual references to Class 5 or Better Care at Home in CPR-1 after this iteration.

## 12. Acceptance test data preparation
Iteration 1 has deterministic Pytest coverage for WS1 (situation mapping), WS3 (recipient directory), WS8 (correspondence CRUD + autosave + versioning + inbound), and the rename cascade. See `/app/backend/tests/test_lf1_iter1.py`.

Iterations 2, 3, 4 will layer additional Pytest and testing-agent verification against acceptance tests T1–T40.

## 13. Rename inventory — EXECUTED (Iteration 1 WS15)
Every user-facing surface renamed:

| Surface | Old | New | Status |
|---|---|---|---|
| Frontend tool tile (`/ai-tools`) | Reassessment Letter Drafter | Letters & Follow-ups | ✓ |
| Frontend landing tiles | Reassessment Letter Drafter | Letters & Follow-ups | ✓ |
| Frontend features page | Reassessment Letter Drafter | Letters & Follow-ups | ✓ |
| Command palette | Reassessment Letter | Letters & Follow-ups | ✓ |
| Tool gate lookup | Reassessment Letter Drafter | Letters & Follow-ups | ✓ |
| Related links guide label | Reassessment Letter | Letters & Follow-ups | ✓ |
| SEO pageConfig entry | Reassessment Letter Generator | Letters & Follow-ups | ✓ |
| Tool content data | Reassessment Letter Drafter | Letters & Follow-ups | ✓ |
| Router path | `/ai-tools/reassessment-letter` | `/ai-tools/letters-and-follow-ups` | ✓ (301 redirect) |
| Admin support tool list | Reassessment Letter | Letters & Follow-ups | ✓ |
| Pricing comparison table | Reassessment Letter Generator | Letters & Follow-ups | ✓ |
| Legacy CHSP guides | Reassessment Letter Generator | (retained — historical references still describe the reassessment capability which now lives inside LF-1) | Deferred |
| Legacy SEO blog articles | Wayly Reassessment Letter Generator | (retained — article slug preserved for SEO continuity; article body still describes the reassessment feature which is now situation 1 in LF-1) | Deferred |
| Backend routes | `/api/public/reassessment-letter` | (retained during Iteration 2 transition; hard rename after LF-1 generation engine lands) | Deferred |
| Existing prompt files (`agents.py::_letter_prompt`) | Not renamed | (retained; superseded status header added in Iteration 2 when letter engine lands) | Deferred |
| PostHog events | `reassessment_*` | (no legacy events fire currently; LF-1 fires new `lf1_*` events per Antony's answer #2 hard rename) | ✓ |
| Feature flag names | `rlg_*` | `lf1_*` | ✓ |

## 14. URL slug decision — ANTONY CHOICE 1b
`/ai-tools/letters-and-follow-ups` chosen. 301 redirect from `/ai-tools/reassessment-letter` is live.

## 15. PostHog migration approach — ANTONY CHOICE 2b
Hard rename now, rebuild dashboards immediately. No dual-emit window. Legacy `reassessment_*` events would fire from RLG-1 but the RLG-1 UI never had PostHog wiring in the first place. All new `lf1_*` events fire from Iteration 1 onward.

## 16. Success metrics — LOCKED
Instrumentation targets:
- `lf1_situation_selected` (props: situation_id, archetype)
- `lf1_archetype_generated` (Iteration 2 — props: archetype, recipient_type, word_count)
- `lf1_output_format_used` (Iteration 2 — props: format=email|pdf|mac_portal)
- `lf1_cross_tool_import_source` (Iteration 3 — props: source_tool, imported_field_count)
- `lf1_follow_up_triggered` (Iteration 3 — props: archetype, days_overdue)
- `lf1_escalation_triggered` (Iteration 3 — props: from_archetype, to_recipient)
- `lf1_response_received` (Iteration 3 — props: archetype, days_since_send)
- `lf1_feedback_submitted` (Iteration 3 — props: rating=up|down, has_reason)
- `lf1_elder_abuse_pathway_entered` (Iteration 4 — props: reached_letter_gate=bool)
- `lf1_elder_abuse_letter_gate_passed` (Iteration 4 — props: safety_gate_dismissed=bool)

## 17. Terms and disclaimer footer copy — LOCKED
See `/app/backend/lib/lf1.py::TERMS_FOOTER_COPY`. Copy is plain Australian English, ACL-compliant. Rendered as `lf1-terms-footer` on the front door and `lf1-detail-terms` on every draft.

## 18. Aboriginal and Torres Strait Islander pathway content review
Reassessment intake includes the option "Would you like this reassessment to be conducted by an Aboriginal and Torres Strait Islander assessment organisation where available?" (rendered in `CorrespondenceDetail.jsx` for situations 1 and 2). OPAN ATSI advocacy line captured in recipient directory (`opan_atsi`).

Per Antony's guidance, shipping with OPAN materials as reference; ideally reviewed with an ATSI aged care specialist post-launch.

## 19. Complaint mode selection UX — LOCKED (Iteration 1 UI)
Three radio-style buttons on the detail page (`lf1-complaint-mode-open`, `lf1-complaint-mode-confidential`, `lf1-complaint-mode-anonymous`). Trade-off copy locked:

- **Open** — "Full identity in the letter and signature."
- **Confidential** — "Identity retained; asks the recipient to treat as confidential."
- **Anonymous** — "Complainant identity stripped. ACQSC can investigate but cannot contact you for more information."

Only surfaces on complaint / escalation / guided_pathway archetypes.

## 20. Trial versus paid access matrix — LOCKED (locked decision #24)
Full LF-1 access for trial users in v1. `ToolGate` currently blocks trial users from PPC/DEC/CPR — the LF-1 tool tile inherits the same gate today via `useToolAccess`. **Iteration 2 will lift the gate** to match locked decision #24. Iter 1 ships behind the paid-tier gate as an interim measure.

## 21. Response Draft archetype prompt template — LOCKED SHAPE FOR ITERATION 2
Response Draft prompt (Iteration 2):
- Opens with a reference to the inbound message: date received, source (email / portal / post / phone note), sender label, subject or content summary.
- Addresses the points raised in the inbound, quoted where necessary.
- Advances the sender's position (accept, refute, request further information, escalate).
- Preserves the case-file chronology by including references to the original outbound letter this responds to (via `replies_to`).
- Response window matched to the original outbound archetype (default 14 business days for provider replies, 28 days for MAC).

---

## Iteration 1 delivery summary

### Backend
- `/app/backend/data/lf1/recipient_directory.yaml` — 10-record seed directory.
- `/app/backend/lib/lf1.py` — YAML loader + 12-situation mapping + 7 archetypes + safety copy + Terms footer + enum constants.
- `/app/backend/routes/lf1.py` — 12 HTTP endpoints (situations, archetypes, safety, directory list/get, correspondence create/list/read/patch/autosave/delete, inbound logging).
- Wired into `server.py::api.include_router(build_lf1_router(...))`.

### Frontend
- `/app/frontend/src/pages/tools/LettersFollowUps.jsx` — front door + situation triage + elder abuse gate + Terms footer.
- `/app/frontend/src/pages/tools/CorrespondenceLog.jsx` — persistent case file.
- `/app/frontend/src/pages/tools/CorrespondenceDetail.jsx` — intake + autosave + complaint mode + ATSI + Terms ack + delete.
- Route + 301 redirect from `/ai-tools/reassessment-letter` in `App.js`.
- Rename cascade across 10 files (see §13 above).

### Testing
- Deterministic Pytest at `/app/backend/tests/test_lf1_iter1.py` — 20+ tests covering situation mapping, archetype constants, recipient directory loader, correspondence CRUD, autosave, versioning, inbound logging, deletion audit.
- CPR-1 fixture updated (Class 8 / Glorious Services Pty Ltd).

### What's deferred to Iteration 2+
- Letter generation engine (LLM prompts per archetype + citation library).
- Cross-tool imports.
- Follow-up + escalation notifications.
- Family Coordinator sharing.
- PDF + MAC portal output formats.
- Elder abuse safeguarding record generator.
- Response Draft LLM prompt.
- Feedback mechanism.
- Trial-user access lift.
- Tone check on Escalation/Complaint output.
