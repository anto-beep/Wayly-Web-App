# Privacy Policy Amendment — CPR-1 Care Plan Reviewer

**Draft status:** Draft v1 — NOT YET PUBLISHED
**Author:** Kindred / Wayly Engineering
**Draft date:** 09 February 2026
**Solicitor sign-off:** REQUIRED before publication to https://wayly.com.au/privacy. Sign-off record must be captured at `/legal/signoff/`.

---

This amendment introduces the Care Plan Reviewer (CPR-1) tool. It supplements the existing Wayly Privacy Policy and does not replace any prior clauses. If any clause below conflicts with an existing clause, the existing clause remains in force pending solicitor review.

---

## 1. Care plan storage

### 1.1 What we store

When you upload a care plan through the Care Plan Reviewer, Wayly stores:

- The original file you uploaded (PDF, DOCX, JPG, PNG, HEIC, or WebP).
- The extracted plain-text version of the file.
- A structured extraction of the plan (services, hours, categories, providers, effective dates).
- Findings from every analysis run performed on the plan.
- Any notes you add to the plan or to individual findings.

### 1.2 Where we store it

All care plan data is stored in Amazon Web Services region `ap-southeast-2` (Sydney, Australia). Your care plan does not leave Australia at any point in the storage lifecycle.

### 1.3 Retention

We retain your care plans for as long as your account is active or until you delete them, whichever is sooner. When you delete a care plan:

- The plan enters a 30-day soft-delete window during which you can restore it.
- After 30 days, the plan is permanently deleted from our systems, including from backups.

Before permanent deletion, we prompt you to download the original file so that you always retain your own copy.

### 1.4 Encryption

Care plan data is encrypted at rest using cluster-managed encryption and encrypted in transit using TLS 1.2 or later.

---

## 2. Cross-tool signal use

The Care Plan Reviewer produces findings by combining your care plan with signal from other Wayly tools you have used, specifically:

- **Statement Decoder:** the last three decoded statements for the same participant, used to check that services delivered match services in the plan.
- **Budget Calculator:** your most recent budget calculation, used to check that the plan's implied volume matches your classification's budget.
- **Provider Price Checker:** your most recent provider comparison, used to check unit prices.
- **Classification Self-Check:** the outcome of your most recent self-check.
- **Reassessment Letter Generator:** whether a reassessment letter was generated in the last 90 days.
- **Contribution Estimator:** your most recent contribution estimate.
- **Family Coordinator:** household membership and roles for the participant.

These signals are only used to enrich findings. They are never combined with information from other participants or other households, and they are never shared with third parties.

Your participant profile authorisation from the Participant Profile (PP-1) covers this cross-tool use. If you have not authorised cross-tool signal use in your participant profile, the Care Plan Reviewer will operate in stand-alone mode without pulling other tools' data.

---

## 3. Redact-before-analysis toggle

The Care Plan Reviewer includes a "Redact names and addresses before analysis" toggle, defaulted OFF. When you enable this toggle:

- Wayly runs a redaction pass on the extracted text before sending it to the analysis model. The pass removes person names, physical addresses, and Medicare numbers.
- The original file you uploaded is still stored unredacted in our systems, because it is your data and you may need it later.
- Only the model input is redacted. Findings produced by the analysis are stored against the unredacted plan.

The redaction pass is a best-effort filter. It cannot guarantee that every identifier will be removed, particularly if the text is unusual or heavily formatted. Do not rely on the redaction toggle alone to comply with any statutory obligation to remove personal information.

---

## 4. Household sharing

You can share a care plan review with other members of your Wayly household through the Family Coordinator. Sharing operates in three modes:

- **Private (default):** Only you and any household admin can see the review.
- **Household read-only:** All household members can view the review but cannot edit or delete it.
- **Household with notes:** Household members can view the review and add their own notes to findings.

Sharing the review does NOT share the original uploaded file by default. Raw file access is a separate toggle you must explicitly enable per household member. This matters because your original file may contain more personal information than the review artefact.

Every share action is audit-logged with the timestamp, sharer, recipient, and access level. You can revoke a share at any time.

---

## 5. Re-review notifications

The Care Plan Reviewer sends re-review prompts when:

- Your plan is more than 12 months old and has not been reviewed.
- The reference legislation the review was run against has been updated (for example, when the 01 October 2026 personal-care funding change lands).
- Your Statement Decoder shows persistent underspend or overspend against the plan for three consecutive statements.

Re-review prompts are delivered in-app and by email, according to your notification preferences at `/settings/notifications`. No re-review is ever automatically triggered — you always choose when to run one.

You can silence any prompt category per plan in `/settings/notifications`.

---

## 6. Contact

If you have any question about this amendment, contact Wayly at `hello@wayly.com.au`.

---

## 7. Amendment history

- **09 Feb 2026 — v1.** Initial draft covering care plan storage, cross-tool signal use, redaction toggle, household sharing, and re-review notifications. Awaiting solicitor sign-off before publication.
