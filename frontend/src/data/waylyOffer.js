// Shared Wayly offer wording (verbatim from the editorial plan, Nov 2026).
// Reuse everywhere the offer appears so disclosures stay consistent and correct:
// one free Statement Decoder use every 120 days with no card; the 7-day trial
// needs a card; no payment screen sits between a public article and the free decode.
export const WAYLY_OFFER = {
    free_decode: {
        label: "Decode my statement free",
        href: "/ai-tools/statement-decoder",
        disclosure: "One free statement decode every 120 days. No sign-up or card required.",
    },
    estimator: {
        label: "Explore the Contribution Estimator",
        href: "/ai-tools/contribution-estimator",
    },
    trial: {
        label: "Explore the 7-day trial",
        href: "/pricing",
        disclosure: "Card required. After 7 days, Solo is A$24.50 per fortnight or Family is A$49.50 per fortnight unless you cancel. Cancel before your first charge in Settings → Billing.",
    },
    ask_wayly: {
        label: "Ask Wayly a question",
        href: "/ask-wayly",
        disclosure: "Free. No card required.",
    },
    letters: {
        label: "Explore Letters & Follow-ups",
        href: "/ai-tools/letters-and-follow-ups",
        disclosure: "Part of the separate 7-day trial. Card required; cancel before your first charge in Settings → Billing.",
    },
    invoice_checker: {
        label: "Explore the Invoice Checker",
        href: "/ai-tools/invoice-checker",
        disclosure: "Part of the separate 7-day trial. Card required. After 7 days, Solo is A$24.50 per fortnight or Family is A$49.50 per fortnight unless you cancel.",
    },
};
