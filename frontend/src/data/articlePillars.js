/**
 * Phase 5 hub-and-spoke wiring — map each tool article slug to the Phase 4
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
        { href: "/ai-tools/reassessment-letter", label: "Reassessment Letter", sub: "Request a higher level" },
        { href: "/ai-tools/classification-self-check", label: "Open the self-check", sub: "Twelve quick questions" },
    ],
    "wayly-reassessment-letter-generator-support-at-home-reassessment": [
        { href: "/guides/my-aged-care-assessment-delay", label: "Assessment delay guide", sub: "How to push for urgency" },
        { href: "/support-at-home-levels", label: "Confirm the level you are requesting", sub: "Levels overview" },
        { href: "/ai-tools/reassessment-letter", label: "Open the Reassessment Letter", sub: "Draft in 60 seconds" },
    ],
    "wayly-contribution-estimator-support-at-home-fees": [
        { href: "/policy/personal-care-free-1-october-2026", label: "Personal care change", sub: "Zero contribution from October 2026" },
        { href: "/policy/no-worse-off-guarantee", label: "No worse off guarantee", sub: "Transition protection" },
        { href: "/ai-tools/contribution-estimator", label: "Open the Contribution Estimator", sub: "See your share by service" },
    ],
    "wayly-care-plan-reviewer-support-at-home-care-plan": [
        { href: "/services/respite", label: "Respite services", sub: "Carer breaks" },
        { href: "/guides/parent-refuses-help", label: "When a parent refuses help", sub: "Practical scripts" },
        { href: "/ai-tools/care-plan-reviewer", label: "Open the Care Plan Reviewer", sub: "Audit your plan" },
    ],
    "wayly-family-coordinator-managing-parents-aged-care": [
        { href: "/guides/sibling-disagreements-about-mum", label: "Sibling disagreements", sub: "Bringing family on side" },
        { href: "/guides/caring-from-far-away", label: "Caring from far away", sub: "Long distance carer setup" },
        { href: "/ai-tools/family-coordinator", label: "Open Aged Care Q&A", sub: "Ask anything, any timezone" },
    ],
};
