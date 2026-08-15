# ACL Review: Wayly Plan-Change and Cancellation Copy

**Product:** Wayly (wayly.com.au)
**Requested:** UXF-1 v3 Section 8 — Australian Consumer Law compliance on subscription messaging.
**Requester:** Antony @ Wayly
**Target sign-off:** before public launch.

---

## Context

Wayly offers three tiers plus one add-on:

- **Solo** — $19 per month.
- **Family** — $39 per month, includes 2 participants.
- **Family additional participant** — $19 per month, per extra participant.
- **Professional** — $299 per month, for advisers.

Plus a **7-day free trial** on Solo and Family.

Current copy lives in `frontend/src/pages/Pricing.jsx`, `frontend/src/components/PaywallModal.jsx`, and `frontend/src/components/TrialEndingModal.jsx`. Under UXF-1 v3 we're moving these values into an INDEX-1 registry so pricing lives in one file.

The copy paths that touch ACL:

1. **Trial-ending banner** ("Your trial ends in X days").
2. **Paywall modal** ("Continue for $19/month" after trial).
3. **Downgrade flow** ("Switching to Solo removes access to X, Y, Z").
4. **Cancellation confirmation** ("You can cancel any time. Your access continues until the end of the current billing period.").
5. **Failed-payment retry** ("We could not charge your card. We will try again in 3 days.").
6. **Refund policy** (currently only in Terms; not surfaced at cancellation).

## Proposed copy

### Trial-ending banner
> Your Wayly free trial ends in **{n} days**. After that, you will be charged **$39 per month** until you cancel. No lock-in contract. Cancel any time from Settings, Plan and billing.

### Paywall modal (post-trial)
> To keep using Wayly's AI tools, choose a plan below. You will be charged **{price} per month**. No lock-in. Cancel any time. Refunds available under our published Refund Policy (link).

### Downgrade confirmation
> Switching from **Family** to **Solo** will remove access to: **saved participants beyond the first**, **shared statements**, and **the Family Coordinator**. Your Family access continues until **{date}**. From that date you will be charged **$19 per month**.

### Cancellation confirmation
> Are you sure you want to cancel? You will continue to have full access to Wayly until **{end-of-period-date}**. After that date, no further charges will be made and your account will move to a read-only state. You can reactivate any time within 60 days. After 60 days, all your data is permanently deleted.

### Failed-payment retry
> Your **{cardBrand} ending {last4}** was declined for this month's Wayly subscription. We will try again on **{retryDate}**. If we cannot charge on that date, your account moves to a read-only state and no further attempts are made. You can update your card any time in Settings.

### Refund pointer (surfaced at cancellation)
> If this month's charge feels wrong (accidental renewal, missed cancellation), you can request a refund at **support@wayly.com.au** within 30 days. Refunds are considered case-by-case and issued to the original card within 5 business days if approved.

## Questions for you

1. Does the **downgrade access-loss** copy meet the ACL "clear and prominent" test for material changes to the service being downgraded?
2. Is the **cancellation** copy sufficiently clear that no future charges will be made? Should we add an explicit "$0 will be charged from {date}" line?
3. Should the **refund** copy be surfaced upfront on the pricing page (not just at cancellation)?
4. Is "no lock-in" wording accurate for **all** three paid tiers, including Professional at $299?
5. Any wording on the **failed-payment** flow that constitutes an undue-hardship notice we should add?
6. Should each pricing display carry a plain-text **"GST inclusive"** line (assuming Wayly is GST-registered)?

## Where the copy lives (for change management)

- Pricing values: to be moved from `pages/Pricing.jsx` into `backend/seed_program_reference.py` under a `pricing.*` group so changes are auditable.
- Cancellation and downgrade flows: `pages/Settings.jsx` → BillingTab.
- Trial banner: `components/TrialEndingModal.jsx`.
- Paywall: `components/PaywallModal.jsx`.

## Sign-off / adjust

- [ ] Approve copy as written.
- [ ] Suggest edits (attach as track-changes on this file).
- [ ] Require a public Refund Policy page before publication (Wayly will draft, you review).
- [ ] Require the plain-text "GST inclusive" line on all pricing displays.

Please return signed with any redlines. Thank you.
