/**
 * Anomaly explainer, plain-English descriptions for each deterministic
 * rule the Statement Decoder can fire.
 *
 * Each entry is keyed by the raw rule code the backend emits (e.g.
 * "RULE_9_CONTRIBUTION_MISMATCH") and describes:
 *   - title:       the rule's human name (Title Case, no jargon).
 *   - explanation: a one-line "what this means" for family carers.
 *
 * Rendered by the anomaly cards in `DecoderResultView.jsx` as a Tooltip.
 */

const EXPLAINERS = {
    // Care management fee rules
    RULE_1_CARE_MGMT_CAP: {
        title: "Care Management Cap Exceeded",
        explanation: "The provider charged more than 10% for care management. That is above the Support at Home cap for the quarter.",
    },
    RULE_1B_CARE_MGMT_MONTHLY: {
        title: "Care Management Above 10%",
        explanation: "The monthly care management fee is above the standard 10% ceiling. Ask the provider to explain the extra charge.",
    },
    RULE_1B_CARE_MGMT_BELOW_STANDARD: {
        title: "Care Management Below 10%",
        explanation: "The provider charged less than 10% for care management this month. Not a problem, just below the usual rate.",
    },

    // Contribution rules
    RULE_9_CONTRIBUTION_MISMATCH: {
        title: "Participant Contribution Looks Off",
        explanation: "The amount the participant paid does not match what pension status suggests. Might be a genuine calculation error.",
    },
    RULE_9_INCONSISTENT_RATE: {
        title: "Inconsistent Contribution Rate",
        explanation: "Different line items use different participant-contribution rates. Ask the provider which one is correct.",
    },
    RULE_9_PENSION_STATUS_UNKNOWN: {
        title: "Pension Status Not Stated",
        explanation: "The statement does not say whether the participant is a full pensioner, part pensioner or self-funded. Contribution checks are less precise without it.",
    },

    // Extraction and reconciliation
    RULE_15_GROSS_TOTAL_PARSE_WARNING: {
        title: "Decoded Total Off From Statement",
        explanation: "Our extracted total does not match the statement's printed total. Some line items may be missing from the decoded view.",
    },
    RULE_25_SOURCE_ARITHMETIC_GAP: {
        title: "Statement Adds Up Differently",
        explanation: "The provider's own subtotal does not match the sum of the individual line items. Ask them to reconcile.",
    },
    RULE_25_WORDS_VS_NUMERALS: {
        title: "Numbers Do Not Match Words",
        explanation: "The written amount and the numeric amount on the statement disagree. Verify the correct figure before paying.",
    },

    // Duplicate and audit rules
    RULE_2: {
        title: "Weekend or After-Hours Charge",
        explanation: "A service was billed at a weekend or after-hours rate. Check the date to confirm it really was outside standard hours.",
    },
    RULE_3_DUPLICATE_EXACT: {
        title: "Possible Duplicate Charge",
        explanation: "Two line items look identical (same date, service and amount). One may have been billed twice.",
    },
    RULE_4: {
        title: "AT-HM Coding Issue",
        explanation: "An assistive-tech or home-modification item is coded to the wrong stream, or a participant contribution was applied when it should be $0.",
    },
    RULE_6_WORKER_SUBSTITUTION: {
        title: "Worker Substitution",
        explanation: "A different worker delivered this service. Confirm the substitute is qualified for the care required.",
    },
    RULE_7: {
        title: "Unusual Pattern",
        explanation: "This charge stands out compared with the rest of the statement. Give it a closer look.",
    },
    RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS: {
        title: "Previous-Period Credit or Refund",
        explanation: "The provider has credited or refunded an amount from an earlier statement. Confirm it matches what you expected.",
    },
    RULE_11_BROKERED_PREMIUM: {
        title: "Brokered Rate Premium",
        explanation: "The provider used a subcontracted worker at a higher rate. You can ask for the reason and whether a cheaper option was available.",
    },
    RULE_11B_ATHM_AMOUNT_EXCEEDS_TIER: {
        title: "AT-HM Above Approved Amount",
        explanation: "The assistive-tech or home-modification claim is larger than the approved envelope. Ask the provider for a written justification.",
    },
    RULE_12_AT_HM_ACTIVE: {
        title: "AT-HM Commitment Not Yet Claimed",
        explanation: "An approved assistive-tech / home-modification order is still active. Check with the provider that delivery is on track.",
    },
    RULE_13_QUARTERLY_UNDERSPEND: {
        title: "Quarterly Budget Underspent",
        explanation: "A large chunk of the quarterly budget is unused. It may roll over, or the participant may be under-serviced.",
    },
    RULE_13_MID_QUARTER_UPDATE: {
        title: "Mid-Quarter Update",
        explanation: "The provider updated the plan or budget mid-quarter. Confirm the change was agreed and documented.",
    },
    RULE_14_PERIOD_PARSE_WARNING: {
        title: "Statement Period Unusual",
        explanation: "The statement period length does not match a normal monthly or quarterly cycle. Double-check the header dates.",
    },
    RULE_16_STREAM_DISCREPANCY: {
        title: "Stream Total Discrepancy",
        explanation: "The line items in one stream do not add up to the stream subtotal shown on the statement.",
    },
    RULE_16_SUPPLEMENT_AMOUNT_VARIANCE: {
        title: "Supplement Amount Variance",
        explanation: "A supplement (like oxygen or continence) is charged at an amount different from the schedule. Verify with the provider.",
    },
    RULE_17_CARE_PLAN_REVIEW_DUE: {
        title: "Care Plan Review Due",
        explanation: "It looks like a care plan review is due soon. Book it with the provider or aged-care assessor.",
    },
    RULE_17_18_REVIEW_AND_INCREASE_MERGED: {
        title: "Care Plan Review and Increase",
        explanation: "Services have increased around the same time as a care plan review. Confirm the increase is documented in the plan.",
    },
    RULE_18_SERVICE_INCREASE: {
        title: "Sharp Service Increase",
        explanation: "The volume of services has jumped notably compared with prior periods. Check that this is expected and agreed.",
    },
    RULE_19_AT_HM_LARGE_CLAIM: {
        title: "Large AT-HM Claim",
        explanation: "A large assistive-tech / home-modification claim (over $1,500) is at or near its approved amount. Confirm delivery is complete.",
    },
    RULE_20_ABN_FORMAT: {
        title: "Provider ABN Missing or Invalid",
        explanation: "The provider's ABN is missing or does not look like a valid Australian Business Number. Compliance issue.",
    },
    RULE_21_PROHIBITED_ADMIN_FEE: {
        title: "Prohibited Admin or Exit Fee",
        explanation: "The provider has charged a brokerage, exit or entry fee, these are not permitted under Support at Home rules.",
    },
    RULE_21_OXYGEN_ADVISORY: {
        title: "Oxygen Certification Advisory",
        explanation: "This oxygen-related item may need supplementary certification. Confirm the participant's paperwork is up to date.",
    },
    RULE_24_DATE_OUTSIDE_PERIOD: {
        title: "Line Item Dated Outside Period",
        explanation: "A line item's service date sits outside the statement's period. It may have been billed to the wrong month.",
    },
    RULE_26_LEGACY_HCP_TERMINOLOGY: {
        title: "Legacy Home Care Package Language",
        explanation: "The statement still uses old Home Care Package terminology after the 1 Oct 2026 transition. Ask the provider to update.",
    },
    RULE_27_GST_ON_GST_FREE: {
        title: "GST Charged on GST-Free Services",
        explanation: "GST has been applied to a care service that should be GST-free. Ask the provider to remove the GST and refund the difference.",
    },
    RULE_28_STRADDLING_OCT_2026: {
        title: "Period Straddles 1 October 2026",
        explanation: "This statement spans the 1 October 2026 rule change. Some line items may fall under different rules on either side.",
    },
    RULE_29_MISSING_ACT_DISCLOSURE: {
        title: "Missing Aged Care Act Reference",
        explanation: "The footer does not mention the Aged Care Act 2024 or Support at Home Program Manual. Minor compliance flag.",
    },
    RULE_30_FUNDING_CADENCE_MISMATCH: {
        title: "Funding Cadence Mismatch",
        explanation: "A quarterly statement is listing monthly government contribution figures (or vice versa). Reconcile with the provider.",
    },
    RULE_31_AMBIGUOUS_CATEGORY: {
        title: "Vague Service Description",
        explanation: "A line item's description (e.g. 'combined activities') is too vague to verify. Ask the provider for a breakdown.",
    },
    RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH: {
        title: "Provider Name Inconsistent",
        explanation: "The provider name in the header does not match the name in the footer. Confirm you are billed by the correct entity.",
    },
    RULE_33_MIXED_DATE_FORMATS: {
        title: "Mixed Date Formats",
        explanation: "Different line items use different date formats on the same statement. Cosmetic, but worth flagging.",
    },
    RULE_34_DATE_INHERITED_ROW: {
        title: "Date Was Inherited From Row Above",
        explanation: "A line item's date field was blank on the statement and had to be inferred. Confirm the actual service date.",
    },
};

/**
 * Look up the explainer for a rule code. Falls back to a generic message
 * when the code is unknown (e.g. new rule the frontend has not yet been
 * updated for).
 */
export function getAnomalyExplainer(ruleCode) {
    if (!ruleCode || typeof ruleCode !== "string") {
        return null;
    }
    // Direct lookup
    if (EXPLAINERS[ruleCode]) return EXPLAINERS[ruleCode];
    // Prefix fallback: match "RULE_9" against "RULE_9_CONTRIBUTION_MISMATCH".
    // Useful for the older short-form rule keys that some code paths still emit.
    const prefixMatch = Object.keys(EXPLAINERS).find(
        (k) => k.startsWith(ruleCode + "_") || ruleCode.startsWith(k + "_"),
    );
    if (prefixMatch) return EXPLAINERS[prefixMatch];
    return null;
}

/**
 * Format a rule code as a short display label ("R15 GROSS TOTAL PARSE WARNING"
 * → "R15") for use in compact badges.
 */
export function shortRuleLabel(ruleCode) {
    if (!ruleCode) return "";
    return ruleCode.replace(/^RULE_/, "R").replace(/_/g, " ");
}

export default EXPLAINERS;
