/**
 * Shared constants + helpers for the Onboarding wizard.
 *
 * Extracted from Onboarding.jsx in Feb 2026 so each step component can
 * be split into its own file. Nothing in here has behavioural changes;
 * this is a copy-paste extraction of the constants that lived at the
 * top of Onboarding.jsx.
 */

export const STEPS = [
    { id: 1, label: "Essentials" },
    { id: 2, label: "Authorisation" },
    { id: 3, label: "Recommended" },
    { id: 4, label: "All done" },
];

export const PENSION_OPTIONS = [
    { v: "full_pension", label: "Full Age Pension", hint: "Receives 100% of the Age Pension" },
    { v: "part_pension", label: "Part Age Pension", hint: "Receives a reduced Age Pension under means testing" },
    { v: "cshc", label: "Commonwealth Seniors Health Card (CSHC)", hint: "Above pension threshold but holds CSHC" },
    { v: "self_funded", label: "Self-funded retiree", hint: "Not eligible for the Age Pension or CSHC" },
    { v: "unsure", label: "I'm not sure", hint: "Wayly will use a range, you can update later" },
];

export const STATEMENT_DELIVERY_OPTIONS = [
    { v: "email", label: "Email" },
    { v: "post", label: "Post" },
    { v: "portal", label: "Provider portal" },
    { v: "other", label: "Other" },
];

export const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

export const CAREGIVER_RELATIONSHIPS = [
    { v: "daughter", label: "Daughter" },
    { v: "son", label: "Son" },
    { v: "spouse_partner", label: "Spouse / partner" },
    { v: "sibling", label: "Sibling" },
    { v: "grandchild", label: "Grandchild" },
    { v: "friend", label: "Friend" },
    { v: "paid_carer", label: "Paid carer" },
    { v: "power_of_attorney", label: "Power of attorney" },
    { v: "other", label: "Other" },
];

export function classificationsFromSnapshot(snap) {
    const out = [];
    for (let v = 1; v <= 8; v++) {
        const row = snap?.classifications?.[String(v)];
        if (row) out.push({ v, annual: row.annual });
    }
    return out;
}
