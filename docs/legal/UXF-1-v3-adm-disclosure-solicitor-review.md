# Solicitor Review: Automated Decision-Making Disclosure

**Product:** Wayly (wayly.com.au)
**Requested:** UXF-1 v3 Section 3.23 — Australian Privacy Principle 1.4(f) transparency around automated decisions.
**Requester:** Antony @ Wayly
**Target sign-off:** before public launch of the AI tool suite.

---

## Context

Wayly runs seven surfaces that produce automated determinations users may reasonably act on:

1. **Contribution Estimator** — weekly and annual Support at Home participant contribution.
2. **Provider Price Checker** — comparison of a provider's rate against the Department of Health indicative range.
3. **Statement Decoder** — line-item anomaly detection on Support at Home monthly statements.
4. **Care Plan Reviewer** — findings against the Aged Care Act 2024, Statement of Rights, and NAC Quality Standards.
5. **Classification Self-Check** — suggested classification level (1 to 8).
6. **Letters and Follow-ups** — AI-drafted letter body (user edits before sending).
7. **Family Coordinator / Ask Wayly** — AI answers to general aged-care questions.

Each surface will carry a disclosure block directly below the primary result and above the primary CTA. Copy is identical across surfaces so we build one legal artefact rather than seven.

## Proposed default copy

> **This estimate was calculated automatically from the figures you entered and the Department of Health rates. You can ask any Wayly team member to check the calculation, or run the numbers by an independent financial adviser.**

The word "estimate" is swapped per tool at render time:
- Contribution Estimator: "estimate"
- Provider Price Checker: "price comparison"
- Statement Decoder: "decode and anomaly list"
- Care Plan Reviewer: "set of findings"
- Classification Self-Check: "suggested level"
- Letters and Follow-ups: "letter draft"
- Family Coordinator: "answer"

Per-tool overrides (all reviewed for tone and accuracy):

**Price Checker:**
> This price comparison was calculated automatically from the rate you entered against the Department of Health indicative range. It is a guide, not financial advice. You can ask any Wayly team member to check the numbers.

**Statement Decoder:**
> This decode and its anomaly list were produced automatically by comparing every line of your statement to Support at Home rules. Confidence varies per finding, shown on each anomaly card. You can ask any Wayly team member to review anything that looks wrong.

**Care Plan Reviewer:**
> These findings were produced automatically by comparing your care plan against the Aged Care Act 2024, the Statement of Rights, and the National Aged Care Quality Standards. This is a preparation aid for your next provider meeting, not a formal audit.

**Family Coordinator:**
> These answers are generated automatically from your question and the Aged Care Act 2024. They are general information, not legal or financial advice for your specific situation. You can contact any Wayly team member for clarification.

**Letters and Follow-ups (in tool):**
> This letter was drafted automatically from your intake and the linked tool state above. Read it in full before sending. Wayly Letters and Follow-ups is a drafting assistant, not legal advice.

## Questions for you

1. Does the default copy discharge our APP 1.4(f) transparency obligation for a **general-purpose consumer aged-care tool**?
2. Are "You can ask any Wayly team member" and "run the numbers by an independent adviser" acceptable as the human-in-the-loop pathways?
3. Should we make the disclosure link out to a fuller Automated-Decision-Making Policy page (currently not published) rather than the copy alone?
4. Is any per-tool wording (in particular Care Plan Reviewer and Family Coordinator) understating the human review invitation? Should each carry an explicit "This is not a substitute for individual legal or medical advice" line?

## Where the copy lives (for change management)

- Single source of truth: `frontend/src/uxf/copy.js` under `COPY.disclosure`.
- Per-tool overrides passed inline at each of the seven callsites.
- Any wording changes flow through a single commit and are visible in the UXF QA lint output.

## Sign-off / adjust

- [ ] Approve default copy as written.
- [ ] Approve per-tool overrides as written.
- [ ] Suggest edits (attach as track-changes on this file).
- [ ] Require an ADM Policy page before publication (Wayly will draft, you review).

Please return signed with any redlines. Thank you.
