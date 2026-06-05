/**
 * Phase 4 Batch C — Policy explainer pages.
 * Three pages that capture the most-asked Support at Home policy questions.
 *
 * IMPORTANT editorial rules:
 *   - Never frame "price caps" or "1 July 2026" as a future event.
 *   - Use neutral framing: "previously announced policy", "since deferred".
 *   - Personal care becomes fully government funded on 1 October 2026.
 *   - Support at Home replaced Home Care Packages on 1 November 2025.
 */
export const POLICIES = [
    {
        slug: "personal-care-free-1-october-2026",
        title: "Personal care becomes free under Support at Home from 1 October 2026 | Wayly",
        description: "From 1 October 2026, personal care under Support at Home moves to fully government funded for all participants. See what changes and what to do.",
        h1: "Personal care becomes fully government funded from 1 October 2026",
        overline: "Policy explainer",
        intro: "From 1 October 2026, personal care under Support at Home moves to fully government funded for every participant. This is one of the most significant changes in the program since it replaced Home Care Packages on 1 November 2025. It affects every household that uses personal care services.",
        keyTakeaways: [
            "Personal care contribution drops to zero from 1 October 2026",
            "Applies to every participant regardless of classification or pension status",
            "Quarterly budget headroom increases for households that use personal care heavily",
            "No action required. Statements reflect the change automatically",
        ],
        sections: [
            {
                heading: "What changes on 1 October 2026",
                paragraphs: [
                    "Personal care services include help with showering, dressing, grooming, toileting and continence support. Today they sit in the Independence stream and a participant contribution applies (5 per cent for a full age pensioner, 17.5 per cent for a part age pensioner, 50 per cent for a self funded retiree).",
                    "From 1 October 2026 the contribution drops to zero. The government pays the full cost for every participant. The change applies to all hours of personal care delivered through your registered Support at Home provider.",
                ],
            },
            {
                heading: "How it affects your quarterly budget",
                paragraphs: [
                    "Before October 2026 a personal care hour at 78 dollars costs a full age pensioner 3 dollars 90 cents from their pocket and 74 dollars 10 cents from their quarterly Independence budget. After October the same hour costs the pensioner zero. The full 78 dollars comes from the quarterly Independence budget. Where families overpaid out of pocket before, this is now genuine cash flow relief.",
                    "Households with high personal care use should plan ahead. Many Level 4 to Level 8 households can now afford an extra one to two hours of personal care per week without raising the classification.",
                ],
                note: "Use the [Budget Calculator](/ai-tools/budget-calculator) to project the change. From 1 October 2026 set personal care contribution to zero and rerun.",
            },
            {
                heading: "What you need to do",
                bullets: [
                    "Nothing immediate. The change is automatic.",
                    "Check your October 2026 statement. Personal care lines should show no participant contribution",
                    "If the statement still shows a contribution after 1 October, raise it with your provider in writing",
                    "Plan a care plan review for late October to use the freed budget headroom well",
                ],
            },
            {
                heading: "What does not change",
                bullets: [
                    "Cleaning, gardening, transport, meals, and social support still attract a contribution",
                    "Clinical Care remains fully government funded (no change)",
                    "Classifications and quarterly budget figures remain the same",
                    "Lifetime cap rules remain the same",
                ],
            },
        ],
        faqs: [
            { q: "Why is personal care being treated differently to other services?", a: "Personal care is seen as a dignity service that should not be rationed by ability to pay. The change aligns Support at Home with the principle that essential daily care is a public good." },
            { q: "Does the change apply to privately paid personal carers?", a: "No. The change applies only to services delivered through your registered Support at Home provider. Privately paid carers are unchanged." },
            { q: "What if my parent's plan starts after 1 October 2026?", a: "All new and existing plans use the new contribution rate from that date onward." },
            { q: "Will providers cut hours to make room for higher demand?", a: "No. Providers are required to deliver the hours written in the care plan. If your provider attempts to reduce hours, contact your case manager and OPAN on 1800 700 600." },
        ],
        related: [
            { href: "/services/personal-care", label: "Personal care service page", sub: "What it covers and what it does not" },
            { href: "/ai-tools/budget-calculator", label: "Budget Calculator", sub: "Project your new quarterly capacity" },
            { href: "/ai-tools/contribution-estimator", label: "Contribution Estimator", sub: "See contribution rates by service" },
        ],
    },
    {
        slug: "price-caps-status",
        title: "Service price caps under Support at Home — current status | Wayly",
        description: "Many families ask about service price caps under Support at Home. Here is what was announced, what was deferred, and where the rules stand today.",
        h1: "Service price caps under Support at Home — where the rules stand",
        overline: "Policy explainer",
        intro: "Service price caps were part of the original Support at Home design. The policy intent was to set a maximum hourly rate per service so participants would not pay above market for funded services. The implementation was subsequently deferred by the Department of Health while consultation continued. This page explains the current state in plain English.",
        keyTakeaways: [
            "Service price caps are not currently in force",
            "Providers set their own rates within the broader Support at Home rules",
            "The published rate determines the participant contribution amount",
            "Always compare your provider's rate against the network median",
        ],
        sections: [
            {
                heading: "What the cap rule was meant to do",
                paragraphs: [
                    "The original design intended to set a maximum allowable hourly rate for each common service (cleaning, gardening, transport, personal care, allied health, nursing). Providers charging above the cap would be unable to bill the participant's quarterly budget for the excess. The participant would either accept the gap as a private cost or move to a provider within the cap.",
                ],
            },
            {
                heading: "Why it was deferred",
                paragraphs: [
                    "The Department received significant submissions during consultation. Concerns included regional cost differences, allied health rates that legitimately exceed any reasonable cap, and the risk of providers withdrawing from low margin regions. The cap implementation has been pushed back while a more nuanced rate guidance approach is developed.",
                ],
            },
            {
                heading: "What protects households in the meantime",
                bullets: [
                    "The published per service rate sets the participant's contribution. Above that rate the participant pays the gap in full",
                    "Providers must disclose their pricing clearly in the care plan and on statements",
                    "Network median rates are visible in tools like the Wayly Provider Price Checker",
                    "OPAN (1800 700 600) provides free advocacy if you believe your provider is charging unfairly",
                ],
                note: "If your statement shows rates well above the network median, run a free check with the [Provider Price Checker](/ai-tools/provider-price-checker).",
            },
        ],
        faqs: [
            { q: "Are caps coming back?", a: "The Department has not published a confirmed start date. We update this page as the policy position changes." },
            { q: "Can I switch providers if mine is expensive?", a: "Yes. You can change providers at any time. There is a process to follow but no penalty for switching." },
            { q: "Does the cap deferral mean providers can charge anything?", a: "No. Providers must still publish their rates and operate within consumer law and Aged Care Quality Standards." },
        ],
        related: [
            { href: "/services/personal-care", label: "Personal care", sub: "Free from 1 October 2026" },
            { href: "/ai-tools/provider-price-checker", label: "Provider Price Checker", sub: "Compare your rate to the network median" },
            { href: "/policy/no-worse-off-guarantee", label: "No worse off guarantee", sub: "Your protection if you were on a Home Care Package" },
        ],
    },
    {
        slug: "no-worse-off-guarantee",
        title: "The no worse off guarantee under Support at Home | Wayly",
        description: "If you were on a Home Care Package before 1 November 2025, the no worse off guarantee protects your funding and contributions under Support at Home.",
        h1: "The no worse off guarantee under Support at Home",
        overline: "Policy explainer",
        intro: "When Support at Home replaced Home Care Packages on 1 November 2025, the government introduced a no worse off guarantee. Participants who held a Home Care Package on 31 October 2025 cannot be moved to a lower funding tier or asked to pay a higher contribution than they did under the package.",
        keyTakeaways: [
            "Applies to participants who held a Home Care Package on 31 October 2025",
            "Funding level cannot be reduced because of the transition",
            "Contribution percentages cannot increase under the transition",
            "Holds even if circumstances would otherwise put the person at a higher contribution rate",
        ],
        sections: [
            {
                heading: "Who the guarantee covers",
                paragraphs: [
                    "The guarantee covers any participant who was an active Home Care Package recipient on 31 October 2025. The participant's classification under Support at Home cannot reduce the package level they held. The participant's contribution percentage cannot be higher than it was under the previous package arrangement.",
                ],
            },
            {
                heading: "What the guarantee protects",
                bullets: [
                    "The package level on the day of transition (a Level 4 package holder becomes a Support at Home Level 4 participant at minimum)",
                    "The contribution percentage on the day of transition",
                    "Any unspent funding rolls into the Support at Home budget under existing rules",
                ],
            },
            {
                heading: "When the guarantee does not apply",
                bullets: [
                    "Participants who started after 1 November 2025 (the new rules apply directly)",
                    "If the participant's circumstances change in a way that would naturally increase their entitlement, the no worse off guarantee floor remains, but the participant may also benefit from any higher entitlement",
                ],
            },
        ],
        faqs: [
            { q: "How do I check the guarantee applies to me?", a: "Log in to My Aged Care or call 1800 200 422. They can confirm your package level on 31 October 2025 and your current contribution percentage." },
            { q: "Has anyone been moved to a worse position by mistake?", a: "A small number of households reported this in the first weeks of the new program. If your contribution suddenly increased, raise it with your case manager and call OPAN on 1800 700 600 for advocacy support." },
        ],
        related: [
            { href: "/policy/personal-care-free-1-october-2026", label: "Personal care change", sub: "Personal care free from 1 October 2026" },
            { href: "/policy/price-caps-status", label: "Service price caps status", sub: "Current state of the cap policy" },
            { href: "/services/personal-care", label: "Personal care service page", sub: "What is funded and how it changes" },
        ],
    },
];

export function policyBySlug(slug) {
    return POLICIES.find((p) => p.slug === slug);
}
