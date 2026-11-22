# OXY-1 v1 — Phase 0 Audit Report

**Audit date:** Feb 2026
**Auditor:** E1 (Emergent agent)
**Blocking gate:** yes. Phase 1 implementation cannot start until Antony confirms the four open items in Section 4 of the spec (and this audit).

---

## 0.1 Current profile schema location

**Backend Pydantic model:** `/app/backend/participant_profile.py` L110–L148 (`Participant`).

Relevant fields already on the model (as at Feb 2026):

```python
# L142-L143
applicable_supplements: Optional[List[str]] = None  # ["oxygen", "veterans", ...]
enteral_feeding_type: Optional[EnteralType] = None  # "bolus" | "non_bolus"
```

- **Certification-related fields present:** NONE. There is no `oxygen_certification`, no `certifying_practitioner_name`, no `certification_date`, no `certification_review_date`, no per-supplement metadata.
- **Storage:** `applicable_supplements` is a `List[str]` on `db.participants`. Wire values are the raw supplement keys (`"oxygen"`, `"enteral_bolus"`, `"enteral_non_bolus"`, `"veterans"`, `"dementia_cognition"`, `"eachd_top_up"`). Enteral is stored as either `"enteral_bolus"` or `"enteral_non_bolus"` in the array PLUS a mirrored `enteral_feeding_type` field (unified by BUD-1 v1 · F1).
- **TypeScript type on the frontend:** implicit; the client treats participant docs as untyped JSON in `useAuth` / `api.get("/participants")`. There's no shared TS definition to update — adding one is a nice-to-have but not a blocker.

**Recommendation for F1:** add `oxygen_certification: Optional[OxygenCertification] = None` as a nested object on `Participant`. Keep the existing `applicable_supplements` unchanged (backward-compat with all callers). If Antony picks the reusable "keyed dictionary" pattern in spec §6 today, add `certifications: Dict[str, MedicalCertification]` instead and mount `oxygen` as the first key.

---

## 0.2 Budget Calculator handling of the Oxygen tick

**Endpoint:** `POST /api/public/budget-calc` — `backend/server.py` L3999–L4029.

```python
for name in (body.applicable_supplements or []):
    sup = _pr.get_supplement(name)
    # ... eligibility filters ...
    annual_aud = 0.0
    if "daily_aud" in sup:
        annual_aud = round(float(sup["daily_aud"]) * 365, 2)
    elif "pct_of_base_individual" in sup and daily_base_individual > 0:
        annual_aud = round(daily_base_individual * (float(sup["pct_of_base_individual"]) / 100.0) * 365, 2)
    annual_supplements_total += annual_aud
    applied_supplements.append({ "name": name, ..., "annual_aud": annual_aud })
```

- Ticking Oxygen adds `$14.66 × 365 = $5,350.90/yr` to `annual_supplements_total`. No cross-check against a certification field, because none exists.
- The result payload carries `applied_supplements: [{ name: "oxygen", daily_aud: 14.66, annual_aud: 5350.90 }]` and `annual_total_with_supplements = annual_total + annual_supplements_total`.
- Client (`BudgetCalculatorTool.jsx`) renders the tick as a simple checkbox with no certification prompt.

**F2 addition point:** the client-side checkbox + backend response are the exact hook points for the amber warning banner + inline expander. No blocking dependency.

---

## 0.3 Statement Decoder handling of the Oxygen supplement line

**Extraction:** `backend/agents.py` L368 (system prompt for `parse_statement`) explicitly instructs the LLM:

> SUPPLEMENT LINE ITEMS: Some statements include supplement line items labelled "Oxygen supplement", … Extract these as line items with `stream` set to `"supplement"` and the supplement name … (`oxygen`, `enteral_bolus`, …) in the `service_code` field.

So Oxygen lines ARE recognised as a distinct stream. They are NOT currently flagged as anomalies. The audit pipeline runs anomaly rules on the extracted lines but there is no rule that fires on Oxygen presence.

**Anomaly severity model:** the persisted schema (per `agents.py` L717) declares:

> Severity strings must be lowercase: "high", "medium", "low".

There is no existing `"advisory"` severity. Adding `"advisory"` per F3 requires:
- Adjust the `PARSER_SYSTEM` severity comment (or leave and treat advisory as a separate list on the audit response).
- Extend `anomaly_count = { "high": 0, "medium": 0, "low": 0, "advisory": 0 }` at server.py L1797 and L3088.
- Update `DecoderResultView.jsx` (front-end) to render the advisory bucket under a separate "Things worth checking" section, not counted in the "issues found" header.

Open item 4 on the spec is answered by this audit: **yes, `"advisory"` is a NEW severity level** and needs to be added. Not a big change.

---

## 0.4 Care Plan Reviewer behaviour

**Backend:** `backend/server.py` search for `care.*plan.*review` and `agents.py` for the reviewer system prompt. The reviewer already emits domain-specific callouts for clinical / independence / everyday-living streams but has NO Oxygen-specific callout. Oxygen therapy mentions currently pass through as generic clinical content.

**Recommendation for F4:** add the Oxygen callout to the reviewer output via a new deterministic rule (regex on `oxygen` / `concentrator` / `oxygen therapy` in the extracted care plan text), styled with the shared `OXYGEN_CERTIFICATION_COPY` constant from F6.

---

## 0.5 Ask Wayly system prompt on supplements

**File:** `backend/agents.py` around L137. Current supplement guidance is a single line:

> Oxygen supplement ($14.66/day) for participants whose care plan covers oxygen. Aged Care Rules 2025, section 196-15.

No mention of medical practitioner certification. F5 needs to append the block quoted in spec §3.F5.

**Session-scoping:** Ask Wayly already accepts a `statement_id` parameter (per STMT-UI-1 v2). For OXY-1 the session is naturally participant-scoped, so no changes to session id shape needed.

---

## 0.6 Privacy Act posture

**APP 3 (collection).** Certification metadata (`oxygen_certification.certifying_practitioner_name`, `certification_date`) is *health information* under the Privacy Act 1988 §6(1). Wayly's current Privacy Policy v1.1 covers general care data collection but does not explicitly enumerate medical practitioner certification records as a category. **Recommend Antony amend the policy before F1 launches** (spec §4 Open Item 1).

**APP 11 (security).** Participant data is stored in MongoDB Atlas managed by Emergent. Encryption at rest + in transit is on by default. Formal residency attestation (ap-southeast-2) requires an Emergent Support ticket if needed for the Privacy Policy language. Flagged as a non-blocking dependency; hardening beyond the current baseline is not required for OXY-1 itself.

**Third-party sharing (spec §4 Open Item 3).** Wayly does not currently share participant profile data with providers, DVA, or Services Australia through any automated path. Confirmed by inspection of `server.py` — no outbound `/participants` propagation to third parties. An "email the certification to your provider" export flow (per spec §4 Open Item 3) would be additive; not needed for F1.

---

## Summary of Phase 0 findings

| Item | Status | Blocker? |
|---|---|---|
| Profile schema location + additions | Clear · additive · no migration risk | No |
| Budget Calc integration point | Clear · client-side + backend-response hooks | No |
| Statement Decoder recognises Oxygen | Yes as its own stream. Advisory anomaly = new severity level. | No |
| Care Plan Reviewer surfacing | Callout to be added via new deterministic rule | No |
| Ask Wayly prompt update | 1 paragraph append at L137 of `agents.py` | No |
| Privacy Policy amendment | Not covered today. **Blocks F1 launch until amended.** | **YES** (per Antony's Open Item 1) |
| APP 11 residency attestation | Emergent Support ticket if formal statement required | No (soft) |
| New "advisory" severity value | Adjust schema + counter + renderer | No (small addition) |
| Reusable `MedicalCertification` shape | Recommend `certifications: Dict[str, MedicalCertification]` keyed by supplement type | Recommend now to unblock ENT-1 |

## Open items requiring Antony's confirmation (recapping spec §4)

1. **Privacy Policy update.** Confirm the amendment is in flight before F1 lands, OR authorise F1 to ship against the current policy on the basis that the collection is family-recorded, opt-in, and stored inside the existing profile envelope.
2. **Retention.** Confirm certification records match the existing profile retention window (participant profile stays until the household closes their account + a defined retention tail — default 30 days).
3. **Third-party sharing.** Confirm Wayly will NOT auto-share certification records. Add an explicit "export to provider" flow in a later prompt if useful.
4. **Advisory anomaly severity.** Confirm we add `"advisory"` as a fourth severity level in the decoder schema. **Recommendation: yes**, and route it into a separate "Things worth checking" section on the results view without inflating the "issues found" count.
5. **`OxygenCertification` vs `MedicalCertification` shape.** I recommend taking the keyed dictionary shape (`certifications: Dict[SupplementType, MedicalCertification]`) NOW so ENT-1 lands cleanly. Confirm.

---

**Phase 0 gate: audit complete. Awaiting Antony's confirmation on the five open items above before executing F1–F6 + O1–O12.**
