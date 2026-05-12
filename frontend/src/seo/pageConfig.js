/**
 * Per-page SEO config registry. Used by <SeoHead /> across all public pages.
 *
 * Rules (from /resources/SEO doc):
 *   - title ≤60 chars · description 140–160 chars
 *   - one focus keyword per page (in title + h1 + first 100 words)
 *   - bridge legacy "home care package" with new "support at home" terms
 */

export const SEO = {
    home: {
        title: "Wayly · AI for Australian Support at Home",
        description:
            "Decode aged-care statements, check classifications and plan budgets — Wayly's AI assistant helps Australian families navigate Support at Home in plain English.",
        path: "/",
    },
    features: {
        title: "Features · Wayly",
        description:
            "Statement Decoder, Budget Calculator, Classification Self-Check and 5 more tools to make Support at Home (and legacy Home Care Package) admin simpler.",
        path: "/features",
    },
    pricing: {
        title: "Pricing · Wayly",
        description:
            "See Wayly plans for Australian families navigating Support at Home — start free, upgrade when you need full statement decoding and household coordination.",
        path: "/pricing",
    },
    trust: {
        title: "Trust & Safety · Wayly",
        description:
            "How Wayly keeps your aged-care data private and accurate: Australian-hosted, human-reviewed content, and clear AI disclaimers on every result.",
        path: "/trust",
    },
    demo: {
        title: "See Wayly in Action · Demo",
        description:
            "Watch how Wayly decodes a Support at Home statement, flags anomalies and explains charges in plain English — without signing up.",
        path: "/demo",
    },
    contact: {
        title: "Contact Wayly Support",
        description:
            "Reach Wayly's Australian support team for help with Support at Home statements, billing questions or partnership enquiries — usually under 24 hours.",
        path: "/contact",
    },
    forAdvisors: {
        title: "Wayly for Aged Care Advisers",
        description:
            "Help your clients understand Support at Home statements, budgets and classifications faster. Free Adviser plan with audit trail and client export.",
        path: "/for-advisors",
    },
    forGPs: {
        title: "Wayly for GPs & Health Pros",
        description:
            "Refer patients to Wayly to demystify Support at Home billing, classifications and reassessments — built for Australian families, free for advocacy use.",
        path: "/for-gps",
    },
    resources: {
        title: "Aged Care Resources · Wayly",
        description:
            "Plain-English guides, glossary and templates for Support at Home and Home Care Package families — written and reviewed by Australian aged-care experts.",
        path: "/resources",
    },
    articlesIndex: {
        title: "Articles · Wayly Aged Care Resources",
        description:
            "Wayly's plain-English articles on Support at Home statements, classifications, budgets and the 2026 program changes. Reviewed by aged-care experts.",
        path: "/resources/articles",
    },
    glossary: {
        title: "Aged Care Glossary · Wayly",
        description:
            "Plain-English Australian aged-care glossary: ACAT, Support at Home, AN-ACC, Home Care Package, classifications, contributions — written for families.",
        path: "/resources/glossary",
    },
    templates: {
        title: "Aged Care Templates · Wayly",
        description:
            "Free downloadable templates for Australian aged care: reassessment letters, complaint letters, statement query letters — drafted by experts, edit-ready.",
        path: "/resources/templates",
    },
    aiTools: {
        title: "Wayly AI Tools for Aged Care",
        description:
            "Eight free AI tools for Australian Support at Home: statement decoder, budget calculator, classification check, price checker and more — built for families.",
        path: "/ai-tools",
    },

    // ----- AI TOOLS (each is a SoftwareApplication) -----
    toolStatementDecoder: {
        title: "Support at Home Statement Decoder · Wayly",
        description:
            "Upload your Support at Home statement and Wayly's AI explains every charge in plain English — flags anomalies, double-billing and provider errors.",
        path: "/ai-tools/statement-decoder",
        toolName: "Statement Decoder",
        toolDesc:
            "Plain-English breakdown of any Australian Support at Home (or Home Care Package) statement. Spot anomalies, double-charges and unfair fees.",
        howTo: {
            name: "How to decode a Support at Home statement",
            description: "Three-step process to understand any aged-care statement.",
            steps: [
                { name: "Upload statement", text: "Upload your Support at Home or HCP statement (PDF or photo)." },
                { name: "Review plain-English summary", text: "Wayly shows what each line means and flags possible anomalies." },
                { name: "Take action", text: "Use Wayly's suggested questions to query unclear charges with your provider." },
            ],
        },
        faqs: [
            { q: "Does Wayly work with old Home Care Package statements?", a: "Yes. Wayly understands both legacy Home Care Package statements and the new Support at Home statements that replaced them on 1 November 2025." },
            { q: "Is my data shared with my provider?", a: "No. Your statements are private to you and anyone you invite to your Wayly household. Wayly does not share data with providers." },
            { q: "What anomalies does Wayly flag?", a: "Wayly highlights duplicate charges, fees outside your classification budget, missing rollover credits, and charges that don't match Support at Home price caps." },
        ],
    },
    toolBudgetCalculator: {
        title: "Support at Home Budget Calculator · Wayly",
        description:
            "Estimate your Support at Home quarterly budget by classification, see rollover allowances and plan care spending — works for legacy HCP budgets too.",
        path: "/ai-tools/budget-calculator",
        toolName: "Budget Calculator",
        toolDesc:
            "Estimate your Support at Home quarterly budget by classification level, see what rolls over, and plan care spending across the year.",
        howTo: {
            name: "Plan your Support at Home budget",
            description: "Quick walkthrough of Wayly's budget planner.",
            steps: [
                { name: "Pick classification", text: "Select your Support at Home classification (1–8) or Home Care Package level." },
                { name: "Add expected services", text: "Enter your weekly care needs — Wayly maps these to allowable budget categories." },
                { name: "See rollover", text: "Wayly shows the up-to-$1,000-or-10% quarterly rollover you can keep, and care-management funds that roll annually." },
            ],
        },
        faqs: [
            { q: "How much budget rolls over each quarter?", a: "Up to $1,000 or 10% of your quarterly budget (whichever is higher) rolls into the next quarter. Care-management funds have no quarterly cap but are limited annually." },
            { q: "Does this work for Home Care Package budgets?", a: "Yes — Wayly bridges legacy HCP level 1–4 budgets and Support at Home classifications 1–8 so you can plan across the transition." },
        ],
    },
    toolPriceChecker: {
        title: "Aged Care Provider Price Checker · Wayly",
        description:
            "Compare your aged-care provider's prices against the Support at Home price caps coming 1 July 2026. Spot overcharges before they hit your budget.",
        path: "/ai-tools/provider-price-checker",
        toolName: "Provider Price Checker",
        toolDesc:
            "Check your provider's hourly rates against the Support at Home national price caps that take effect 1 July 2026.",
        faqs: [
            { q: "When do Support at Home price caps start?", a: "National price caps for Support at Home services start on 1 July 2026. Until then, providers set their own prices and Wayly's checker compares against draft cap ranges." },
        ],
    },
    toolClassification: {
        title: "Support at Home Classification Self-Check",
        description:
            "Quick self-check tool — answer 10 plain-English questions and Wayly estimates which Support at Home classification (1–8) you'd likely be assessed at.",
        path: "/ai-tools/classification-self-check",
        toolName: "Classification Self-Check",
        toolDesc:
            "Estimate your likely Support at Home classification (1–8) with a 5-minute self-assessment.",
    },
    toolReassessment: {
        title: "Reassessment Letter Generator · Wayly",
        description:
            "Draft a clear reassessment request letter for Support at Home in 60 seconds — Wayly fills in the right wording, evidence and template structure for you.",
        path: "/ai-tools/reassessment-letter",
        toolName: "Reassessment Letter Generator",
        toolDesc:
            "Generate a reassessment request letter for Support at Home (or HCP) in 60 seconds.",
    },
    toolContribution: {
        title: "Support at Home Contribution Estimator",
        description:
            "Estimate your Support at Home means-tested contributions before your assessment — Wayly walks you through the income and assets test in plain English.",
        path: "/ai-tools/contribution-estimator",
        toolName: "Contribution Estimator",
        toolDesc:
            "Estimate your means-tested contributions for Support at Home before assessment.",
    },
    toolCarePlan: {
        title: "Aged Care Plan Reviewer · Wayly",
        description:
            "Wayly's AI reviews your aged-care plan, highlights gaps, suggests questions and explains every clinical term — designed for non-clinical family carers.",
        path: "/ai-tools/care-plan-reviewer",
        toolName: "Care Plan Reviewer",
        toolDesc: "Plain-English review of any Support at Home or HCP care plan.",
    },
    toolFamilyCoordinator: {
        title: "Family Aged Care Coordinator · Wayly",
        description:
            "Share Support at Home updates with siblings and family carers privately — Wayly's coordinator keeps everyone aligned on visits, costs and care decisions.",
        path: "/ai-tools/family-coordinator",
        toolName: "Family Coordinator",
        toolDesc: "Coordinate aged-care decisions across multiple family members.",
    },

    // ----- AUTH -----
    login: {
        title: "Sign in · Wayly",
        description: "Sign in to your Wayly account to view Support at Home statements, decoded charges and household updates.",
        path: "/login",
    },
    signup: {
        title: "Create your Wayly account",
        description: "Start your free Wayly account — decode Support at Home statements, plan care budgets and coordinate family carers in one place.",
        path: "/signup",
    },
};
