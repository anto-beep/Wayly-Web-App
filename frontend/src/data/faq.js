/**
 * Phase 4 Batch F, /faq hub.
 *
 * 40 questions across 5 themes. Every entry is short and answerable in a
 * paragraph or less. FAQPage schema emitted per theme group.
 */
export const FAQ_GROUPS = [
    {
        id: "support-at-home-basics",
        title: "Support at Home Basics",
        questions: [
            { q: "What is Support at Home?", a: "Support at Home is the federal in-home aged care program that replaced Home Care Packages on 1 November 2025. It funds the help that lets older Australians remain at home safely." },
            { q: "Who is eligible?", a: "Anyone aged 65 and over (50 and over for Aboriginal and Torres Strait Islander Australians) who has had an Aged Care Assessment Team (ACAT) review confirming they need support to remain at home." },
            { q: "How do I apply?", a: "Call My Aged Care on 1800 200 422 or visit myagedcare.gov.au. You will be screened, then booked for an ACAT assessment, then given a classification and budget." },
            { q: "How long does the application take?", a: "Standard wait times are two to six weeks for the assessment. Urgent referrals via your GP are faster." },
            { q: "What are the classification levels?", a: "Eight levels from Level 1 ($10,731 per year) to Level 8 ($78,106 per year). The Wayly Classification Self-Check helps you see which is most likely to apply." },
            { q: "What was the old Home Care Package program?", a: "Home Care Packages was the previous in-home aged care funding model with four levels. It ran from 2017 to 31 October 2025. Existing recipients moved across with no worse off protection." },
            { q: "Is Support at Home means tested?", a: "Yes. Your contribution rate for Independence and Everyday Living services depends on your pension status (full age, part age, or self funded). Clinical Care is free for everyone." },
        ],
    },
    {
        id: "money-budgets-rates",
        title: "Money, Budgets and Rates",
        questions: [
            { q: "How is the budget paid?", a: "The Department of Health pays your provider on your behalf, drawing from your quarterly budget pool. You see the activity on your monthly statement." },
            { q: "What is the quarterly budget?", a: "Your annual classification budget is split into four quarters. Each quarter has roughly one quarter of the total to spend. Unspent budget rolls into the next quarter up to a cap." },
            { q: "What is the rollover cap?", a: "Approximately 10% of the quarterly budget, with a floor of $1,000. Anything unspent above the cap is forfeited at quarter end." },
            { q: "Why does my hourly rate matter so much?", a: "Your contribution is a share of the published rate. If your provider charges above the published rate you pay 100% of the gap. A small rate increase quietly accelerates your budget burn." },
            { q: "Are service price caps in force?", a: "No. The cap implementation was deferred. Providers set their own rates. See the policy explainer for current detail." },
            { q: "What does the personal care change mean?", a: "From 1 October 2026 personal care services move to fully government funded. The participant contribution drops to zero for personal care." },
            { q: "What is the lifetime cap?", a: "Approximately $135,000 of participant contributions over a lifetime, after which all in-home aged care services are fully government funded. The Wayly Budget Calculator tracks your progress." },
        ],
    },
    {
        id: "providers-quality",
        title: "Providers and Quality",
        questions: [
            { q: "How do I switch providers?", a: "Call My Aged Care on 1800 200 422 and ask to change providers. Takes around two weeks. There is no penalty and no break in your funding." },
            { q: "Can I have more than one provider?", a: "One registered provider at a time. You can use private services alongside if you want a specific worker outside the funded list." },
            { q: "What is a brokered service?", a: "Your provider has subcontracted the service to another company. The brokered rate is sometimes higher than the published rate. Watch for this on your statement." },
            { q: "What if my provider behaves unfairly?", a: "Call the Aged Care Quality and Safety Commission on 1800 951 822, or OPAN on 1800 700 600 for free advocacy." },
            { q: "What is the Wayly Provider Quality Index?", a: "An independent score we calculate using complaint volumes, audit outcomes, and price competitiveness. Never paid for or influenced by providers." },
        ],
    },
    {
        id: "carers-family",
        title: "Carers and Family",
        questions: [
            { q: "Can a family carer share the workload with a provider?", a: "Yes. Most households are a mix of family care and funded services. The plan can be tuned to support the family carer where they need most relief." },
            { q: "Is respite covered?", a: "Yes. In-home, centre-based, and residential respite are all funded under different rules. See the respite service page." },
            { q: "Can siblings share the account?", a: "Yes on the Family plan. Up to five family members, each with role-based view." },
            { q: "Who has legal authority to make decisions?", a: "If your parent has an Enduring Power of Attorney (finance) and Enduring Guardian (medical), those people have authority. Otherwise default law applies." },
            { q: "How do I support a carer who is burning out?", a: "Start with respite. Add Carer Gateway peer support (1800 422 737). Visit the Caregiver guilt guide for more." },
        ],
    },
    {
        id: "wayly-software",
        title: "About Wayly",
        questions: [
            { q: "Is Wayly a Support at Home provider?", a: "No. Wayly is independent software. Your registered provider remains whoever you have chosen. Wayly sits on top of them." },
            { q: "How much does Wayly cost?", a: "You can use the Statement Decoder for free without signing up. Paid plans are Solo at $24.50 per fortnight and Family at $49.50 per fortnight, both with a 7 day free trial. Cancel anytime." },
            { q: "Where is my data stored?", a: "Australia. We never sell your data and never use it to train AI without consent. Read the privacy policy for detail." },
            { q: "Does Wayly take commissions from providers?", a: "No. Never. The Provider Quality Index and the Provider Price Checker are independent and free of commercial influence." },
            { q: "How accurate are the AI tools?", a: "Highly accurate on data they extract correctly, but never perfect. Always verify dollar figures with your provider. Wayly is a co-pilot, not a substitute for your case manager." },
            { q: "Can I cancel anytime?", a: "Yes. Settings, Billing, Cancel auto-renewal. Your data is exported on request and deleted on request." },
        ],
    },
];

export const ALL_FAQ_QUESTIONS = FAQ_GROUPS.flatMap((g) => g.questions);
