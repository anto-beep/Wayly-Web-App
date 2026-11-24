/**
 * CONV-1 · Canonical plan facts — the single source of truth for the few
 * offer details that must never drift across /signup, /pricing, the Landing
 * page and the paywall: trial terms, Caregiver seat counts and the support
 * commitment. Feature bullet lists remain per-surface for now; these settled
 * facts do not, because they drifted (e.g. "5" vs "3" seats, "same-day" vs
 * "one business day") and are the ones with legal/consumer-law weight.
 */
export const TRIAL_DAYS = 7;

export const PLAN_PRICE = {
    solo: "A$24.50",
    family: "A$49.50",
};

export const PLAN_LABEL = {
    solo: "Solo",
    family: "Family",
};

export const CAREGIVER_SEATS = {
    solo: 1,
    family: 3,
};

export const PARTICIPANTS = {
    solo: 1,
    family: 2,
};

// Support commitment (CONV-1 X7 / H2a): a one-person operation commits to a
// reply within one business day. Never advertise "same-day".
export const SUPPORT_LINE = {
    solo: "Priority email support",
    family: "Priority support, reply within one business day",
};

/** Canonical trial sentence (CONV-1 A2). Rendered everywhere trial terms appear. */
export function trialSentence(plan = "family") {
    const label = PLAN_LABEL[plan] || PLAN_LABEL.family;
    const price = PLAN_PRICE[plan] || PLAN_PRICE.family;
    return `Free for ${TRIAL_DAYS} days, then ${price}/fortnight (${label}) unless cancelled. Card required at signup. Cancel any time from Settings → Billing.`;
}
