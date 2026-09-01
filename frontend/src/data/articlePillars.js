/**
 * Phase 5 hub-and-spoke wiring, map each tool article slug to the Phase 4
 * pillar pages that pair with it. Rendered as a "Pillars on Wayly" cluster
 * underneath the existing "Related reading" block on every tool article.
 */
export const ARTICLE_PILLAR_MAP = {
    "wayly-statement-decoder-support-at-home-statement-explained": [
        { href: "/services/personal-care", label: "Personal care service", sub: "Free from 1 October 2026" },
        { href: "/guides/understanding-statement-line-items", label: "How to read your statement", sub: "Line items decoded" },
        { href: "/ai-tools/statement-decoder", label: "Open the Statement Decoder", sub: "Run a free decode" },
    ],
    "wayly-budget-calculator-support-at-home-quarterly-budget": [
        { href: "/support-at-home-levels", label: "Support at Home levels", sub: "All eight budgets" },
        { href: "/policy/personal-care-free-1-october-2026", label: "Personal care change", sub: "Freed-up budget capacity" },
        { href: "/ai-tools/budget-calculator", label: "Open the Budget Calculator", sub: "Project your year" },
    ],
    "wayly-provider-price-checker-support-at-home-prices": [
        { href: "/guides/switching-providers", label: "How to switch providers", sub: "Free, around two weeks" },
        { href: "/policy/price-caps-status", label: "Service price cap status", sub: "Where the rules stand" },
        { href: "/ai-tools/provider-price-checker", label: "Open the Price Checker", sub: "Compare your rate" },
    ],
    "wayly-classification-self-check-support-at-home-levels": [
        { href: "/support-at-home-levels", label: "Support at Home levels", sub: "All eight classifications" },
        { href: "/ai-tools/letters-and-follow-ups", label: "Letters & Follow-ups", sub: "Request a higher level or write to a regulator" },
        { href: "/ai-tools/classification-self-check", label: "Open the self-check", sub: "Twelve quick questions" },
    ],
    "wayly-reassessment-letter-generator-support-at-home-reassessment": [
        { href: "/guides/my-aged-care-assessment-delay", label: "Assessment delay guide", sub: "How to push for urgency" },
        { href: "/support-at-home-levels", label: "Confirm the level you are requesting", sub: "Levels overview" },
        { href: "/ai-tools/letters-and-follow-ups", label: "Open Letters & Follow-ups", sub: "Draft a request in 60 seconds" },
    ],
    "wayly-contribution-estimator-support-at-home-fees": [
        { href: "/policy/personal-care-free-1-october-2026", label: "Personal care change", sub: "Zero contribution from October 2026" },
        { href: "/policy/no-worse-off-guarantee", label: "No worse off guarantee", sub: "Transition protection" },
        { href: "/ai-tools/contribution-estimator", label: "Open the Contribution Estimator", sub: "See your share by service" },
    ],
    "wayly-care-plan-reviewer-support-at-home-care-plan": [
        { href: "/services/respite", label: "Respite services", sub: "Carer breaks" },
        { href: "/guides/parent-refuses-help", label: "When a parent refuses help", sub: "Practical scripts" },
        { href: "/ai-tools/care-plan-reviewer", label: "Open the Support Plan Reviewer", sub: "Audit your plan" },
    ],
    "wayly-family-coordinator-managing-parents-aged-care": [
        { href: "/guides/sibling-disagreements-about-mum", label: "Sibling disagreements", sub: "Bringing family on side" },
        { href: "/guides/caring-from-far-away", label: "Caring from far away", sub: "Long distance carer setup" },
        { href: "/ai-tools/family-coordinator", label: "Open Aged Care Q&A", sub: "Ask anything, any timezone" },
    ],
    "sah-invoice-checker-verify-support-at-home-invoice-five-minutes": [
        { href: "/ai-tools/invoice-checker", label: "Open the Invoice Checker", sub: "Verify before you pay" },
        { href: "/ai-tools/provider-price-checker", label: "Provider Price Checker", sub: "Cross-check the rate" },
        { href: "/ai-tools/letters-and-follow-ups", label: "Letters & Follow-ups", sub: "Draft a query in 60 seconds" },
    ],
    "support-at-home-vs-home-care-packages-what-changed": [
        { href: "/support-at-home-levels", label: "Support at Home levels", sub: "All eight classifications" },
        { href: "/policy/no-worse-off-guarantee", label: "No Worse Off principle", sub: "Transition protection" },
        { href: "/ai-tools/contribution-estimator", label: "Open the Contribution Estimator", sub: "What you'll actually pay" },
    ],
    "three-streams-clinical-independence-everyday-living": [
        { href: "/ai-tools/statement-decoder", label: "Statement Decoder", sub: "See every stream on your statement" },
        { href: "/ai-tools/contribution-estimator", label: "Contribution Estimator", sub: "Rates by pension status" },
        { href: "/support-at-home-levels", label: "Support at Home levels", sub: "How streams flow into each classification" },
    ],
    "lifetime-contribution-cap-most-families-do-not-worry": [
        { href: "/ai-tools/contribution-estimator", label: "Contribution Estimator", sub: "Project your cap trajectory" },
        { href: "/policy/no-worse-off-guarantee", label: "No Worse Off principle", sub: "Grandfathered $84,571 cap" },
        { href: "/ai-tools/statement-decoder", label: "Statement Decoder", sub: "Read the cap tracker line" },
    ],
    "switching-support-at-home-provider-practical-playbook": [
        { href: "/ai-tools/provider-price-checker", label: "Provider Price Checker", sub: "Compare rates in your suburb" },
        { href: "/ai-tools/letters-and-follow-ups", label: "Letters & Follow-ups", sub: "Draft the switch notice" },
        { href: "/policy/exit-fee-ban", label: "Exit fees are prohibited", sub: "Aged Care Act 2024" },
    ],
    "support-at-home-statement-flags-what-to-question": [
        { href: "/ai-tools/statement-decoder", label: "Statement Decoder", sub: "Auto-flag every anomaly" },
        { href: "/ai-tools/invoice-checker", label: "Invoice Checker", sub: "C1-C12 rule engine" },
        { href: "/ai-tools/letters-and-follow-ups", label: "Letters & Follow-ups", sub: "Draft the query in 60s" },
    ],
    "when-to-request-support-at-home-reassessment": [
        { href: "/ai-tools/classification-self-check", label: "Classification Self-Check", sub: "See where you sit" },
        { href: "/ai-tools/reassessment-letter-generator", label: "Reassessment letter", sub: "Draft the request" },
        { href: "/support-at-home-levels", label: "Classification levels", sub: "All eight bands" },
    ],
    "nine-most-common-support-at-home-invoice-errors": [
        { href: "/ai-tools/invoice-checker", label: "Open the Invoice Checker", sub: "Verify before you pay" },
        { href: "/ai-tools/provider-price-checker", label: "Provider Price Checker", sub: "Rate cross-check" },
        { href: "/ai-tools/letters-and-follow-ups", label: "Letters & Follow-ups", sub: "Draft the query" },
    ],
};
