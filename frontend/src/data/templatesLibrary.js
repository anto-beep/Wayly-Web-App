// =============================================================================
// Wayly Templates Library (October 2026 build brief + Title Case naming
// override v1.0, 22/10/2026).
//
// 20 individual aged-care letter and checklist templates, grouped into five
// clusters. Each entry drives a /resources/templates/<slug> page.
//
// Naming rules (from the Title Case override):
//   - name / titleTag / h1 / block headings render in Title Case.
//   - Official government names keep their official casing (see PROPER_NOUNS).
//   - Letter bodies, checklist items and meta descriptions stay sentence case.
// =============================================================================

export const TEMPLATE_CLUSTERS = [
    { id: "Money", label: "Money", blurb: "Statements, invoices, rates, refunds and contributions." },
    { id: "Assessment", label: "Assessment", blurb: "Reviews, reassessments and GP support." },
    { id: "Complaints", label: "Complaints", blurb: "Provider, Commission and advocate escalation." },
    { id: "Changing", label: "Changing", blurb: "Switching provider and moving your funding." },
    { id: "Family", label: "Family", blurb: "Supporters, meetings and care planning." },
];

// Official names that must keep their own capitalisation inside a Title Case
// heading. The heading renderer Title Cases every other word and leaves these
// untouched, so "Support at Home" and "Support At Home" never drift apart.
export const PROPER_NOUNS = [
    "Support at Home",
    "My Aged Care",
    "Aged Care Quality and Safety Commission",
    "Commonwealth Home Support Programme",
    "Aged Care Act 2024",
    "Home Care Package",
    "Services Australia",
    "Older Persons Advocacy Network",
];

const SMALL_WORDS = new Set([
    "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet",
    "at", "by", "from", "in", "of", "on", "to", "with", "into", "over",
]);

// Title-case a heading, preserving official proper nouns exactly.
export function titleCaseHeading(input) {
    if (!input) return input;
    let text = input;
    const tokens = [];
    PROPER_NOUNS.forEach((noun) => {
        const idx = text.toLowerCase().indexOf(noun.toLowerCase());
        if (idx !== -1) {
            const token = `\u0000${tokens.length}\u0000`;
            tokens.push(noun);
            text = text.slice(0, idx) + token + text.slice(idx + noun.length);
        }
    });
    const words = text.split(/(\s+)/);
    let wordCount = 0;
    const total = words.filter((w) => w.trim()).length;
    const out = words.map((w) => {
        if (!w.trim()) return w;
        if (/^\u0000\d+\u0000$/.test(w)) return w;
        wordCount += 1;
        const isFirst = wordCount === 1;
        const isLast = wordCount === total;
        const lower = w.toLowerCase();
        if (!isFirst && !isLast && SMALL_WORDS.has(lower)) return lower;
        return w.charAt(0).toUpperCase() + w.slice(1);
    }).join("");
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[+i]);
}

const DATE_PUBLISHED = "2026-10-22";
const LAST_CHECKED = "22/10/2026";

// Standard escalation ladder facts, rendered when showEscalationLadder is set.
export const ESCALATION_LADDER = [
    "Follow up with the provider in writing if you have no reply by your stated date. Wayly suggests 14 days. That is our suggestion, not a legal deadline: no fixed number of days applies to providers.",
    "Talk to a free, independent advocate: the Older Persons Advocacy Network (OPAN) Aged Care Advocacy Line, 1800 700 600. Hours are 8am to 8pm Monday to Friday and 10am to 4pm Saturday.",
    "Complain to the Aged Care Quality and Safety Commission: phone 1800 951 822 (food and dining 1800 844 044), online at agedcarequality.gov.au, email info@agedcarequality.gov.au, or post to GPO Box 9819 in your capital city. It acknowledges complaints within 3 business days and must finalise within 90 days unless there are reasons it needs longer. You do not have to raise the issue with the provider first.",
    "Interpreter: TIS National on 131 450. Ask them to call the Commission.",
    "If someone is in immediate danger, call 000.",
];

const TOOLS = {
    statement: { name: "Statement Decoder", url: "/ai-tools/statement-decoder", anchor: "check your statement line by line" },
    invoice: { name: "Invoice Checker", url: "/ai-tools/invoice-checker", anchor: "check the rates on an invoice" },
    contribution: { name: "Contribution Estimator", url: "/ai-tools/contribution-estimator", anchor: "estimate your contributions" },
    budget: { name: "Budget Calculator", url: "/ai-tools/budget-calculator", anchor: "plan your Support at Home budget" },
    classification: { name: "Classification Self-Check", url: "/ai-tools/classification-self-check", anchor: "see which classification fits" },
};

export const TEMPLATES_LIBRARY = [
    {
        slug: "support-at-home-statement-query-letter",
        name: "Support At Home Statement Query Letter",
        titleTag: "Support At Home Statement Query Letter | Wayly",
        metaDescription: "A free letter asking your provider to explain a Support at Home monthly statement line by line. Copy it, fill in the brackets and send.",
        h1: "Support At Home Statement Query Letter",
        cardDesc: "Ask your provider to explain a monthly statement line by line.",
        cluster: "Money",
        tool: TOOLS.statement,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "If a line on your monthly statement doesn't make sense, you can ask your provider to explain it in writing. This letter lists what every Support at Home statement has to show, so nothing gets skipped.",
        blocks: [
            { type: "prose", title: "When To Use It", md: "A service you don't recognise, a price that differs from your service agreement, a budget balance that doesn't add up, or a missing statement." },
            { type: "checklist", title: "Before You Start", items: [
                "The statement for the month in question.",
                "Your service agreement and its price list.",
                "Your own diary of visits, if you keep one.",
                "The participant's My Aged Care ID or the provider's client number.",
            ] },
            { type: "letter", title: "The Letter", body: `[Your full name]
[Address]
[Phone] | [Email]
[DD/MM/YYYY]

[Provider name]
[Provider postal or email address]

Re: Monthly statement query for [participant name], [client number or My Aged Care ID], statement for [month YYYY]

Dear [care partner name or Accounts team],

I am writing [for myself / as the registered supporter of participant name]. I have read the Support at Home monthly statement for [month YYYY] and would like the following items explained in writing.

1. [Date] [service] [amount]: [what looks wrong, for example "this visit is not in our diary" or "the hourly price differs from our service agreement"]
2. [Date] [service] [amount]: [issue]
3. [Add more as needed]

Please also confirm the statement shows each item a Support at Home monthly statement must include:
- funding available at the start and end of the month
- for each service, the date, price, units and total cost
- my contribution rate and the contribution amounts charged
- the subsidy claimed
- any unspent funds and any supplements
- the funding remaining for the quarter
- which services, if any, were delivered by a third party

If a correction is needed, please send an amended statement and tell me whether any amount will be credited back to the budget or refunded to me.

Please reply in writing by [DD/MM/YYYY, we suggest 14 days from today].

Kind regards,
[Name]
[Relationship to participant, if not yourself]` },
            { type: "prose", title: "What To Expect Back", md: "A written explanation, and either a corrected statement or reasons why the charge stands. Statements are due by the last day of the following month, so a July statement is due by 31/08." },
            { type: "prose", title: "If You Get No Response", md: "Use the escalation ladder below. Since 20/05/2026 the government has said the Commission will take regulatory action against providers who do not meet the requirement to issue monthly statements." },
        ],
        faqs: [
            { q: "What must a Support at Home monthly statement show?", a: "It must show funding available at the start and end of the month; each service's date, price, units and total cost; your contribution rate and amounts; the subsidy claimed; unspent funds and supplements; funding left for the quarter; and any services delivered by a third party." },
            { q: "When should I receive my monthly statement?", a: "By the last day of the following month. For example, the statement for July is due by 31/08. You should also receive a final statement if you leave the provider or the program." },
            { q: "Can I ask my provider to explain my statement?", a: "Yes. Under the Aged Care Act 2024 you have the right to know how your Support at Home budget is being spent, and every provider must have a process for handling complaints, including about prices." },
        ],
        relatedSlugs: ["rate-query-letter", "aged-care-invoice-dispute-letter", "care-management-fee-query"],
        sources: ["health.gov.au monthly statements page", "My Aged Care Support at Home costs and contributions"],
    },
    {
        slug: "rate-query-letter",
        name: "Rate Query Letter To Your Provider",
        titleTag: "Rate Query Letter To Your Aged Care Provider",
        metaDescription: "Charge looks higher than your agreed or published price? A polite letter asking your provider to explain the rate and what it includes.",
        h1: "Rate Query Letter To Your Aged Care Provider",
        cardDesc: "Query a charge that looks higher than your agreed or published price.",
        cluster: "Money",
        tool: TOOLS.invoice,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "Government price caps for Support at Home were due on 01/07/2026, but they were paused on 20/05/2026 and no new start date has been set. Providers still set their own prices. They must also set reasonable prices, publish the price they most often charge for each service on My Aged Care, and keep records showing what their prices include. This letter asks for that information.",
        blocks: [
            { type: "prose", title: "When To Use It", md: "A rate that differs from your service agreement, from the price published on My Aged Care, or from what you paid last quarter." },
            { type: "checklist", title: "Before You Start", items: [
                "The invoice or statement line.",
                "Your service agreement.",
                "The provider's published price on the My Aged Care \"Find a provider\" tool. Screenshot it and note the date.",
            ] },
            { type: "letter", title: "The Letter", body: `[Your name, address, phone, email]
[DD/MM/YYYY]

[Provider name and address]

Re: Price query, [participant name], [client number]

Dear [name],

On [statement or invoice, DD/MM/YYYY] the [service type] on [date] was charged at $[amount] per [hour/unit]. [Our service agreement lists $[amount] / Your published price on My Aged Care on DD/MM/YYYY was $[amount] / Last quarter we paid $[amount].]

Please tell me in writing:
1. the price per [hour/unit] for this service and the date it took effect
2. what the price includes (for example travel, administration, weekend or after-hours loadings)
3. when and how you told us about any price change
4. how this price compares with the price you publish on My Aged Care

I understand providers must set reasonable prices based on their costs, and keep records of what their prices include. If this charge was an error, please correct the statement and credit the difference.

I would also like to request a review of our service agreement.

Please reply by [DD/MM/YYYY].

Kind regards,
[Name]` },
            { type: "prose", title: "What To Expect Back", md: "An explanation of the price and what it includes, or a correction. Your provider must agree to review the service agreement when you ask, at any time." },
        ],
        faqs: [
            { q: "Are there price caps on Support at Home services?", a: "Not yet. Price caps were due on 01/07/2026, but the government paused them on 20/05/2026 with no new date. Providers set their own prices but must keep them reasonable and publish them on My Aged Care." },
            { q: "How often can my provider put prices up?", a: "No legal limit was found. The government has encouraged providers to raise prices no more than twice a year." },
            { q: "Can I compare my provider's prices with others?", a: "Yes. Providers publish the price they most often charge on My Aged Care, and the government said it will publish a National Summary of Support at Home Prices each quarter." },
        ],
        relatedSlugs: ["aged-care-invoice-dispute-letter", "aged-care-overcharge-refund-request", "support-at-home-statement-query-letter"],
        sources: ["health.gov.au new consumer protections", "My Aged Care Find a provider"],
    },
    {
        slug: "aged-care-invoice-dispute-letter",
        name: "Aged Care Invoice Dispute Letter",
        titleTag: "Aged Care Invoice Dispute Letter Template | Wayly",
        metaDescription: "Dispute a Support at Home contribution invoice in writing. Pay what's not in dispute, ask for the rest to be held while it's checked.",
        h1: "Aged Care Invoice Dispute Letter",
        cardDesc: "Dispute specific lines on a contribution invoice in writing.",
        cluster: "Money",
        tool: TOOLS.invoice,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "Under Support at Home, your provider claims payment from Services Australia, and Services Australia confirms any contribution you owe. The provider then invoices you for that contribution. If an invoice looks wrong, dispute only the lines in question, in writing.",
        blocks: [
            { type: "checklist", title: "Before You Start", items: [
                "The invoice.",
                "The matching monthly statement.",
                "Your contribution rates from Services Australia.",
                "Your own records of visits.",
            ] },
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name and address]

Re: Dispute of invoice [invoice number] dated [DD/MM/YYYY], [participant name]

Dear [name],

I dispute the following items on the invoice above:

Date: [DD/MM/YYYY] | Service: [service] | Amount charged: $[amount] | Reason: [not delivered / wrong price / wrong contribution category / duplicate]

I will pay the undisputed amount of $[amount] by [DD/MM/YYYY]. Please hold the disputed amount of $[amount] while you check it, and confirm in writing that services will continue as normal in the meantime.

Please send me the records that support each disputed item (visit logs or worker notes) and a corrected invoice if any item is wrong.

Please reply by [DD/MM/YYYY].

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Should I stop paying while I dispute an invoice?", a: "Pay the part you agree with and dispute the rest in writing. That shows good faith and keeps the disagreement narrow. This is Wayly's suggestion, not a legal rule." },
            { q: "Who decides how much contribution I pay?", a: "Services Australia works out your contribution rates from your income and assets. Your provider applies those rates to the services delivered." },
            { q: "What if the provider won't fix it?", a: "Use the escalation ladder: OPAN on 1800 700 600, then the Aged Care Quality and Safety Commission on 1800 951 822." },
        ],
        relatedSlugs: ["support-at-home-statement-query-letter", "aged-care-overcharge-refund-request", "aged-care-complaint-letter-to-provider"],
        sources: ["health.gov.au Support at Home provider payment arrangements"],
    },
    {
        slug: "aged-care-overcharge-refund-request",
        name: "Overcharge Refund Request Letter",
        titleTag: "Aged Care Overcharge Refund Request Letter",
        metaDescription: "Ask your provider to refund an aged care overcharge: credit to the budget and refund of any contribution you paid. Copy-ready letter.",
        h1: "Overcharge Refund Request Letter",
        cardDesc: "Ask for an overcharge to be credited to the budget and refunded to you.",
        cluster: "Money",
        tool: TOOLS.invoice,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "Use this once you have identified an overcharge, often after a statement query. It asks for two things: government-funded amounts credited back to the budget, and any contribution you paid refunded to you.",
        blocks: [
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name and address]

Re: Request for refund of overcharge, [participant name], [client number]

Dear [name],

Following [my query dated DD/MM/YYYY / your reply dated DD/MM/YYYY], the following charges were incorrect:

1. [Date, service, amount charged, correct amount, difference]
2. [...]
Total overcharged: $[amount], of which $[amount] was paid by me as a contribution.

Please:
1. credit $[amount] back to [participant name]'s Support at Home budget
2. refund $[amount] to me by [bank transfer to BSB XXX-XXX, account XXXXXXXX / cheque]
3. send an amended statement showing the correction

Please confirm by [DD/MM/YYYY]. If we cannot agree, I will contact the Aged Care Quality and Safety Commission.

Kind regards,
[Name]` },
            { type: "note", title: "A Note On Refund Powers", md: "On 20/05/2026 the government announced it would give the Commission power to order refunds where providers are found to be overcharging. We could not confirm whether that power has commenced, so this page says \"the government has announced\" rather than \"the Commission can\"." },
        ],
        faqs: [
            { q: "Can I get money back if my provider overcharged?", a: "Yes, ask in writing. Ask for government-funded amounts to be credited to the budget and your own contributions refunded to you. If the provider refuses, contact the Aged Care Quality and Safety Commission." },
            { q: "Does a refund go to me or to the budget?", a: "Usually both. The part the government paid goes back to the budget. The part you paid as a contribution comes back to you." },
            { q: "What evidence helps?", a: "Your service agreement, the published price, the statement, and your own visit diary." },
        ],
        relatedSlugs: ["aged-care-invoice-dispute-letter", "aged-care-quality-and-safety-commission-complaint", "support-at-home-statement-query-letter"],
        sources: ["health.gov.au new consumer protections (20/05/2026)"],
    },
    {
        slug: "care-management-fee-query",
        name: "Care Management Fee Query Letter",
        titleTag: "Care Management Fee Query Letter | Wayly",
        metaDescription: "Under Support at Home, 10% of each quarterly budget funds care management. Ask your provider what you received for it.",
        h1: "Care Management Fee Query Letter",
        cardDesc: "Ask what the 10% care management share actually paid for this quarter.",
        cluster: "Money",
        tool: TOOLS.statement,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "For ongoing Support at Home services, 10% of each quarterly budget is set aside for care management. On Classification 4, for example, that is $763.20 of the $7,632.04 quarterly budget from 01/10/2026. This letter asks what care management involved for you and confirms nothing is charged twice.",
        blocks: [
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name]

Re: Care management, [participant name], quarter [Q], [YYYY]

Dear [care partner name],

I understand 10% of [participant name]'s quarterly budget funds care management. Please tell me:
1. what care management activities you provided this quarter (reviews, phone calls, coordination, visits)
2. who our care partner is and how to reach them
3. whether any other care management or coordination charge appears on our statement, and if so, why
4. when our next care plan review is due

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "How much of a Support at Home budget goes to care management?", a: "10% of each quarterly budget for ongoing services. On Classification 1 from 01/10/2026 that is $275.79 of $2,757.89 a quarter." },
            { q: "Can I be charged extra for care management?", a: "Ask your provider to show you any care management line beyond the 10% deduction and explain it. If you are not satisfied, use the escalation ladder." },
            { q: "What does care management include?", a: "Ask your provider to list it. The care plan review questions template is a good place to start." },
        ],
        relatedSlugs: ["support-at-home-statement-query-letter", "care-plan-review-questions"],
        sources: ["health.gov.au funding classifications for Support at Home"],
    },
    {
        slug: "personal-care-contribution-check-letter",
        name: "Personal Care Contribution Check Letter",
        titleTag: "Personal Care Contribution Check Letter (Oct 2026)",
        metaDescription: "From 01/10/2026 approved personal care has no Support at Home contribution. Check your invoice and query any personal care charge.",
        h1: "Personal Care Contribution Check Letter",
        cardDesc: "Check a personal care charge after the 01/10/2026 change.",
        cluster: "Money",
        tool: TOOLS.invoice,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "From 01/10/2026, personal care under Support at Home moved from the independence contributions category to clinical supports. You do not pay contributions for approved personal care delivered from that date. Personal care still comes out of your quarterly budget. Contributions for care delivered before 01/10/2026 are not refunded, so an October invoice can still show September personal care.",
        blocks: [
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name]

Re: Personal care contributions after 01/10/2026, [participant name]

Dear [name],

Our [statement / invoice] dated [DD/MM/YYYY] shows a contribution of $[amount] for [service, e.g. showering assistance] on [DD/MM/YYYY].

As personal care moved into the clinical supports contribution category on 01/10/2026, I understand no contribution applies to approved personal care delivered on or after that date. Please:
1. confirm whether this service is classed as personal care on the Support at Home service list
2. if it is, remove the contribution and credit or refund $[amount]
3. if it is not, explain which service type it falls under

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Is personal care free under Support at Home now?", a: "From 01/10/2026 you pay no contribution for approved personal care, but it is still paid from your quarterly budget, so it is not unlimited." },
            { q: "Will I get a refund for personal care before October 2026?", a: "No. Contributions for personal care delivered before 01/10/2026 are not refunded, even if invoiced later." },
            { q: "Does this apply to CHSP?", a: "No. The change applies to Support at Home only." },
        ],
        relatedSlugs: ["aged-care-invoice-dispute-letter", "support-at-home-statement-query-letter"],
        sources: ["My Aged Care Support at Home personal care contribution changes"],
    },
    {
        slug: "request-service-records-visit-logs",
        name: "Request For Visit Logs And Service Records",
        titleTag: "Request Aged Care Visit Logs And Records | Wayly",
        metaDescription: "Ask your Support at Home provider for visit logs, worker notes and care records, so you can match charges to what was delivered.",
        h1: "Request For Visit Logs And Service Records",
        cardDesc: "Ask for visit logs, worker notes and records to match charges to services.",
        cluster: "Money",
        tool: TOOLS.statement,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "Visit logs are the easiest way to match each charge on a statement to a service that was actually delivered. You, or someone the participant authorises, can ask the provider for these records.",
        blocks: [
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name]

Re: Request for service records, [participant name], [client number], [DD/MM/YYYY to DD/MM/YYYY]

Dear [name],

Please send me copies of the records for services delivered to [participant name] between [DD/MM/YYYY] and [DD/MM/YYYY], including:
1. visit logs or rosters showing date, start and finish times and worker
2. worker or progress notes for each visit
3. invoices from any third-party or subcontracted provider
4. the current care plan

[I am the registered supporter of participant name. / participant name has consented to me receiving these records, see attached.]

Please send them by [DD/MM/YYYY] in [electronic / paper] form.

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Can I see the care notes from home visits?", a: "You can ask. The participant, or someone they authorise, can request personal information a provider holds about them under the Privacy Act 1988." },
            { q: "Why ask for visit logs?", a: "They are the easiest way to match each charge on a statement to a service that was actually delivered." },
            { q: "What if I'm the adult child, not the participant?", a: "You need the participant's consent or a registered supporter arrangement. See the registered supporter checklist." },
        ],
        relatedSlugs: ["aged-care-invoice-dispute-letter", "switching-support-at-home-providers-checklist", "registered-supporter-checklist"],
        sources: ["Privacy Act 1988", "Support at Home program handbook"],
    },
    {
        slug: "aged-care-financial-hardship-application",
        name: "Financial Hardship Application Pack",
        titleTag: "Aged Care Financial Hardship Application | Wayly",
        metaDescription: "How to apply for aged care financial hardship assistance with form SA462, plus a letter telling your provider you've applied.",
        h1: "Financial Hardship Application Pack",
        cardDesc: "Apply for financial hardship assistance and tell your provider.",
        cluster: "Money",
        tool: TOOLS.contribution,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "If you can't afford your Support at Home contributions for reasons beyond your control, you can apply to Services Australia for financial hardship assistance using the Aged Care Claim for financial hardship assistance form (SA462). Support at Home participants do not need to pay contributions while the application is processed. Tell your provider you have applied.",
        blocks: [
            { type: "checklist", title: "Checklist Before You Lodge", items: [
                "An income and assets assessment for Support at Home is in place.",
                "Form SA462 is complete. Get it from Services Australia, or call the Aged Care line on 1800 227 475, Monday to Friday 8am to 5pm.",
                "Evidence of essential expenses is attached, including housing and home costs.",
                "Any evidence that your actual contributions are higher than expected is attached.",
                "Your provider has been told (letter below).",
            ] },
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name]

Re: Financial hardship application, [participant name], [client number]

Dear [name],

On [DD/MM/YYYY] [participant name] lodged an Aged Care Claim for financial hardship assistance (SA462) with Services Australia. Please pause collection of Support at Home contributions while the application is assessed, and continue services as normal.

I will let you know the outcome as soon as we receive it.

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Do I keep paying contributions while my hardship claim is assessed?", a: "No. If you receive Support at Home, you do not need to pay contributions while the application is being processed." },
            { q: "Which form do I use?", a: "The Aged Care Claim for financial hardship assistance form, SA462, lodged with Services Australia." },
            { q: "Does hardship assistance last forever?", a: "No. If you need ongoing help, apply again before your current assistance ends." },
        ],
        relatedSlugs: ["services-australia-contribution-query", "support-at-home-statement-query-letter"],
        sources: ["My Aged Care financial hardship assistance", "Hardship assistance for aged care fact sheet"],
    },
    {
        slug: "services-australia-contribution-query",
        name: "Services Australia Contribution Query Letter",
        titleTag: "Services Australia Contribution Query | Wayly",
        metaDescription: "Think your Support at Home contribution rate is wrong, or your circumstances changed? A letter asking Services Australia to check it.",
        h1: "Services Australia Contribution Query Letter",
        cardDesc: "Ask Services Australia to check your contribution rate.",
        cluster: "Money",
        tool: TOOLS.contribution,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "Your Support at Home contribution rates are based on your income and assets, and Services Australia sets them. They can change when your circumstances change and with regular indexation in March and September. If a change hasn't been picked up, or the assessment looks wrong, ask for it to be checked.",
        blocks: [
            { type: "letter", title: "The Letter", body: `[Your name, CRN if known, address, phone]
[DD/MM/YYYY]

Services Australia, Aged Care

Re: Support at Home contribution assessment, [participant name], CRN [number]

Dear Officer,

Please review [participant name]'s Support at Home contribution assessment. [Our circumstances changed on DD/MM/YYYY: describe, e.g. sale of an asset, change in pension, partner moved into residential care.] [/ The assessment dated DD/MM/YYYY appears to use [income or asset item] of $[amount], which we believe is incorrect because [reason].]

Please confirm the updated contribution rates in writing and the date they apply from, and let our provider know.

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Who works out my Support at Home contribution?", a: "Services Australia, based on your income and assets." },
            { q: "Can my contribution change?", a: "Yes. It changes with your circumstances, and regular indexation applies in March and September." },
            { q: "Is there a limit on what I pay in total?", a: "Yes. The lifetime cap is $140,652.80, or $88,934.57 under the no worse off principle, as at 20/09/2026. Both are indexed on 20/03 and 20/09." },
        ],
        relatedSlugs: ["aged-care-financial-hardship-application", "support-at-home-statement-query-letter"],
        sources: ["My Aged Care changes to contributions", "health.gov.au participant contributions"],
    },
    {
        slug: "final-statement-and-unspent-funds-request",
        name: "Final Statement And Unspent Funds Request",
        titleTag: "Final Statement And Unspent Funds Request | Wayly",
        metaDescription: "Leaving a provider or Support at Home? Ask for the final statement, final claims and any unspent HCP funds you're owed.",
        h1: "Final Statement And Unspent Funds Request",
        cardDesc: "Ask for the final statement, final invoice and any unspent funds you're owed.",
        cluster: "Money",
        tool: TOOLS.budget,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "When you leave a provider or the program, the provider cannot charge an exit amount. It must issue a final monthly statement and final invoices, tell Services Australia within 28 days of the exit date, and finalise claims within 60 days of the exit date. If you change provider, your funding moves with you, including unspent funds for ongoing services. If you held unspent Home Care Package funds, the provider must work out the participant portion. That portion is transferred to the new provider within 60 days, or refunded to you or your estate if you leave the program.",
        blocks: [
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name]

Re: Exit on [DD/MM/YYYY], [participant name], [client number]

Dear [name],

[participant name]'s services with you end on [exit date DD/MM/YYYY] because [change of provider to new provider name / leaving Support at Home / entering residential care / death on DD/MM/YYYY].

Please:
1. confirm the exit date in writing
2. confirm no exit amount will be charged
3. send the final monthly statement and any final contribution invoice
4. confirm the remaining budget information has been shared with [new provider] within 28 days of the exit date
5. tell me the amount of any unspent Home Care Package funds, split into participant and Commonwealth portions, and when the participant portion will be [transferred to new provider / refunded to account details]

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Can a provider charge an exit fee under Support at Home?", a: "No. Providers cannot charge an exit amount when a participant leaves." },
            { q: "What happens to unspent funds when I change provider?", a: "Your funding moves with you, including unspent funds for ongoing services. The participant portion of any unspent Home Care Package funds goes to the new provider within 60 days." },
            { q: "What happens to unspent HCP funds after a death?", a: "The provider refunds the participant portion to the estate and returns the Commonwealth portion to Services Australia." },
        ],
        relatedSlugs: ["switching-support-at-home-providers-checklist", "request-service-records-visit-logs"],
        sources: ["health.gov.au Changing Support at Home providers", "health.gov.au Exiting the Support at Home program"],
    },
    {
        slug: "my-aged-care-reassessment-request",
        name: "Reassessment Request For My Aged Care",
        titleTag: "Reassessment Request For My Aged Care | Wayly",
        metaDescription: "Needs changed? A clear, factual script and letter to request a support plan review or reassessment through My Aged Care.",
        h1: "Reassessment Request For My Aged Care",
        cardDesc: "A script and letter to request a review or reassessment through My Aged Care.",
        cluster: "Assessment",
        tool: TOOLS.classification,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "A support plan review adjusts your existing support plan. A reassessment can change your classification. Start by talking to your provider; they can review your care plan and contact your assessor. You can also call My Aged Care yourself on 1800 200 422, or speak to an Aged Care Specialist Officer at selected Services Australia centres. My Aged Care takes these requests by phone, so use this letter as your script and keep it as a written record, and give your provider a copy.",
        blocks: [
            { type: "checklist", title: "Before You Start", items: [
                "Dates of falls, hospital stays or diagnoses.",
                "What daily tasks have become harder.",
                "What care is not being met now.",
                "A GP letter, if you have one.",
            ] },
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

To: My Aged Care (by phone 1800 200 422, record kept) / [Provider name]

Re: Request for support plan review or reassessment, [participant name], My Aged Care ID [AC number]

[participant name]'s needs have changed since their last assessment on [DD/MM/YYYY]. Current classification: [Classification n / Transitioned HCP Level n].

What has changed:
- [DD/MM/YYYY]: [event, e.g. fall resulting in hip fracture, hospital admission]
- [new diagnosis or change in memory or mobility]
- [tasks now needing help: showering, meals, medication, getting out of bed]

Care not currently met: [e.g. no help available on weekends; family carer can no longer manage showering]

Supporting evidence: [GP letter dated DD/MM/YYYY; discharge summary].

We request a support plan review or, if the assessor agrees, a reassessment. [Urgent because: describe risk.]

Contact for arranging the assessment: [name, phone]. Interpreter needed: [Yes, language / No].

[Name]` },
            { type: "prose", title: "What To Expect Back", md: "The assessor may change the support plan or decide a reassessment is needed. If you had a Home Care Package, you keep your Transitioned HCP Level. You are approved for a Support at Home classification only if the reassessment gives a higher classification." },
        ],
        howToSteps: [
            { name: "Write down what has changed", text: "List dates of falls, hospital stays, diagnoses and the daily tasks that are now harder." },
            { name: "Get supporting evidence", text: "Ask your GP for a letter describing changed needs." },
            { name: "Talk to your provider", text: "Ask for a care plan review. Your provider can contact your assessor." },
            { name: "Call My Aged Care", text: "Call 1800 200 422 to request a support plan review or reassessment, using the letter as your script." },
        ],
        faqs: [
            { q: "How do I request an aged care reassessment?", a: "Talk to your provider first, or call My Aged Care on 1800 200 422. You can request a support plan review at any time if your needs have changed." },
            { q: "Can a reassessment lower funding for someone who had a Home Care Package?", a: "Department guidance says transitioned HCP recipients move to a Support at Home classification only if they are reassessed for a higher one." },
            { q: "Can a family member ask for a reassessment?", a: "Yes, with the older person's agreement. A registered supporter can help them make and communicate the request." },
        ],
        relatedSlugs: ["gp-letter-request-for-aged-care-reassessment", "care-plan-review-questions"],
        sources: ["My Aged Care how to change your current services"],
    },
    {
        slug: "gp-letter-request-for-aged-care-reassessment",
        name: "GP Letter Request For Aged Care Reassessment",
        titleTag: "Ask Your GP For A Reassessment Letter | Wayly",
        metaDescription: "A short letter asking your GP to describe changed care needs to support a My Aged Care review or reassessment.",
        h1: "Ask Your GP For A Reassessment Letter",
        cardDesc: "Ask your GP to describe changed needs to support a reassessment.",
        cluster: "Assessment",
        tool: TOOLS.classification,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "A specific letter from your GP about changed needs gives an assessor evidence to work with. This short request asks your GP for exactly that.",
        blocks: [
            { type: "letter", title: "The Letter", body: `Dear Dr [name],

[participant name, DOB DD/MM/YYYY] is requesting a review of their aged care support through My Aged Care. Their needs have changed since [DD/MM/YYYY].

Could you please provide a brief letter describing:
1. relevant diagnoses and any changes since [DD/MM/YYYY]
2. how these affect daily tasks such as showering, dressing, meals, medication and mobility
3. any falls, hospital admissions or cognitive changes
4. any risk to safety at home without more support

The letter can be addressed "To the aged care assessor". I'm happy to book a longer appointment for this if needed.

Thank you,
[Name, phone]` },
        ],
        faqs: [
            { q: "Does a GP letter guarantee a higher classification?", a: "No. The assessor decides, but a specific letter about changed needs gives them evidence to work with." },
            { q: "What should the GP letter say?", a: "It should cover changes in diagnoses, daily tasks, falls or hospital stays, and safety risks, with dates." },
            { q: "Will the GP charge for this?", a: "Some do. Ask when you book." },
        ],
        relatedSlugs: ["my-aged-care-reassessment-request", "care-plan-review-questions"],
        sources: ["My Aged Care how to change your current services"],
    },
    {
        slug: "care-plan-review-questions",
        name: "Care Plan Review Question Checklist",
        titleTag: "Care Plan Review Question Checklist | Wayly",
        metaDescription: "Questions to take to your Support at Home care plan review so the plan, the budget and the services match what is needed now.",
        h1: "Care Plan Review Question Checklist",
        cardDesc: "Questions to take to your care plan review, grouped by services, money, care management and what happens next.",
        cluster: "Assessment",
        tool: { name: "Care Plan Reviewer", url: "/ai-tools/care-plan-reviewer", anchor: "goes through your plan with you", cta: "Wayly's Care Plan Reviewer goes through your plan with you" },
        disclaimer: true,
        showEscalationLadder: false,
        intro: "Your provider should review your services at least every 12 months, and sooner if your needs change. You can also ask for your service agreement to be reviewed at any time. Take this checklist to the meeting so nothing gets missed.",
        blocks: [
            { type: "prose", title: "When To Use This Checklist", md: "Before an annual care plan review, before a review you have requested yourself, or before a meeting with a new care partner." },
            { type: "checklist", title: "Before You Start", items: [
                "The current care plan or support plan",
                "The last three monthly statements",
                "Your own notes on what has changed since the last review",
                "The participant's My Aged Care ID or client number",
            ] },
            { type: "questions", title: "Questions About Services And Delivery", items: [
                "What services are in the plan now, and are they all actually happening?",
                "Are any services delivered by a third party, and at what price?",
                "What happens in an emergency, or when a regular worker is away?",
                "Have any services been missed or cut short, and were we charged for them?",
            ] },
            { type: "questions", title: "Questions About Money And Budget", items: [
                "How much of this quarter's budget is used, and what is forecast for the rest of it?",
                "Are we likely to carry funds into the next quarter?",
                "Which services attract a contribution, and at what rate?",
                "Is any personal care being charged a contribution after 01/10/2026?",
            ] },
            { type: "questions", title: "Questions About Care Management", items: [
                "What did care management involve this quarter?",
                "Who is our care partner, and how quickly do they respond?",
                "Does any care management or coordination charge appear beyond the share already set aside?",
            ] },
            { type: "questions", title: "Questions About Needs And What Happens Next", items: [
                "What has changed since the last review, and does the plan reflect it?",
                "Do our needs now go beyond our classification, and should we ask for a reassessment?",
                "What goals did we set last time, and are we meeting them?",
                "What is the date of the next review, and who books it?",
            ] },
            { type: "prose", title: "What To Do After The Review", md: "Ask for the updated plan in writing. If the review shows the funding no longer fits, use the Reassessment Request For My Aged Care template. If a charge came up that nobody could explain, use the Care Management Fee Query Letter or the Support At Home Statement Query Letter." },
        ],
        faqs: [
            { q: "How often should a Support at Home care plan be reviewed?", a: "At least every 12 months, and whenever needs change." },
            { q: "Can I ask for a review sooner?", a: "Yes. Ask your provider at any time. A service agreement review must be done on request." },
            { q: "What if the review shows we need more funding?", a: "Ask about a reassessment through My Aged Care on 1800 200 422." },
            { q: "Who should come to the care plan review?", a: "The participant, whoever supports them day to day, and the care partner. A registered supporter can attend to help the participant make and communicate their own decisions." },
        ],
        relatedSlugs: ["my-aged-care-reassessment-request", "care-management-fee-query", "support-at-home-statement-query-letter"],
        sources: ["Support at Home program handbook"],
    },
    {
        slug: "aged-care-complaint-letter-to-provider",
        name: "Aged Care Complaint Letter To Your Provider",
        titleTag: "Aged Care Complaint Letter To Your Provider",
        metaDescription: "A calm, factual complaint letter to your aged care provider: what happened, what you want fixed and by when.",
        h1: "Aged Care Complaint Letter To Your Provider",
        cardDesc: "A calm, factual complaint letter to your provider: what happened and what you want fixed.",
        cluster: "Complaints",
        tool: null,
        disclaimer: true,
        showEscalationLadder: true,
        intro: "Every provider must have a complaints process. Raising the problem with the provider first is often quickest, but you do not have to. Keep to facts and dates. Do not make claims about a worker's character.",
        blocks: [
            { type: "letter", title: "The Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name], Complaints

Re: Complaint, [participant name], [client number]

Dear [name],

I am making a formal complaint about [short description].

What happened:
- [DD/MM/YYYY, time]: [facts]
- [DD/MM/YYYY]: [facts]

Impact: [effect on the participant, e.g. missed medication, no shower for three days, charge of $X]

What I would like: [specific outcome, e.g. a written explanation, a consistent worker, a corrected statement, an apology, a change to the roster]

Please acknowledge this complaint, tell me who is handling it and when I can expect a response, and reply in full by [DD/MM/YYYY].

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Do I have to complain to the provider before the Commission?", a: "No. You can go straight to the Aged Care Quality and Safety Commission. Raising it with the provider first is often faster." },
            { q: "How long does a provider have to respond?", a: "No fixed number of days was found. Providers must resolve issues as soon as possible and tell you a realistic timeframe." },
            { q: "Can I complain anonymously?", a: "Yes. The Commission accepts anonymous and confidential complaints." },
        ],
        relatedSlugs: ["aged-care-quality-and-safety-commission-complaint", "opan-aged-care-advocate-call-sheet", "aged-care-invoice-dispute-letter"],
        sources: ["agedcarequality.gov.au better practice guide to complaints handling"],
    },
    {
        slug: "aged-care-quality-and-safety-commission-complaint",
        name: "Complaint To The Aged Care Quality And Safety Commission",
        titleTag: "Aged Care Quality And Safety Commission Complaint",
        metaDescription: "How to complain to the Aged Care Quality and Safety Commission: what to include, contact details and what happens next.",
        h1: "Complaint To The Aged Care Quality And Safety Commission",
        cardDesc: "How to complain to the Commission, with the details it asks for.",
        cluster: "Complaints",
        tool: null,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "The Commission handles complaints about providers' obligations under the Aged Care Act 2024 and their funding agreements. You can complain online, by phone on 1800 951 822, by email to info@agedcarequality.gov.au, or by letter to GPO Box 9819 in your capital city. Its process has five stages: collect and triage, assess, resolve, finalise, evaluate.",
        blocks: [
            { type: "letter", title: "The Letter", body: `Aged Care Quality and Safety Commission
GPO Box 9819, [capital city]
[DD/MM/YYYY]

Complaint about [provider name], [service name], [state or territory]

Older person: [name]
My name and contact: [name, address, phone] [or: I wish to remain anonymous / confidential]
Relationship: [self / daughter / son / registered supporter]

What happened, with dates:
- [DD/MM/YYYY]: [facts]

Who it involves: [provider, worker role, responsible person]

What I have already done: [complaint to provider on DD/MM/YYYY, reply on DD/MM/YYYY or no reply]

Outcome sought: [specific]

Attached: [letters, statements, photos]` },
            { type: "prose", title: "What Happens Next", md: "The Commission acknowledges your complaint within 3 business days. It acts immediately if someone is at serious risk of harm. A complaint must be finalised within 90 days unless there are reasons it needs longer, and the Commission aims to finalise 80% within 60 days. If you disagree with the outcome, you can generally ask for a reconsideration within 42 days." },
        ],
        faqs: [
            { q: "How do I make a complaint to the Aged Care Quality and Safety Commission?", a: "Call 1800 951 822, use the online form, email info@agedcarequality.gov.au or write to GPO Box 9819 in your capital city." },
            { q: "How long does the Commission take?", a: "It acknowledges complaints within 3 business days and must finalise them within 90 days unless there are reasons to take longer." },
            { q: "Can I ask for a review of the Commission's decision?", a: "Yes. You can generally request a reconsideration within 42 days of receiving the decision." },
        ],
        relatedSlugs: ["aged-care-complaint-letter-to-provider", "opan-aged-care-advocate-call-sheet"],
        sources: ["agedcarequality.gov.au our complaints process", "agedcarequality.gov.au Service Charter"],
    },
    {
        slug: "opan-aged-care-advocate-call-sheet",
        name: "Aged Care Advocate Call Sheet (OPAN)",
        titleTag: "Aged Care Advocate Call Sheet (OPAN 1800 700 600)",
        metaDescription: "Get ready for a free call with an aged care advocate: a one-page sheet with the facts, dates and outcome you want.",
        h1: "Aged Care Advocate Call Sheet",
        cardDesc: "A one-page sheet to get ready for a free call with an aged care advocate.",
        cluster: "Complaints",
        tool: null,
        disclaimer: false,
        showEscalationLadder: false,
        intro: "OPAN's Aged Care Advocacy Line, 1800 700 600, is free, confidential and independent of providers. It connects you to the advocacy organisation in your state or territory. Hours are 8am to 8pm Monday to Friday and 10am to 4pm Saturday.",
        blocks: [
            { type: "letter", title: "The Call Sheet", body: `Older person: [name, suburb, state]
Program: [Support at Home Classification n / Transitioned HCP Level n / CHSP / residential]
Provider: [name]
The problem in one sentence: [ ]
Key dates: [ ]
What we've tried: [ ]
What we want: [ ]
Does the older person agree to an advocate helping? [Yes / No]
Best time and number to call back: [ ]` },
        ],
        faqs: [
            { q: "Is aged care advocacy free?", a: "Yes. OPAN's services are free, confidential and independent." },
            { q: "What number do I call?", a: "The Aged Care Advocacy Line, 1800 700 600." },
            { q: "Can an advocate help with fees?", a: "Yes. OPAN supports people with concerns about government-funded aged care, including fees and service agreements." },
        ],
        relatedSlugs: ["aged-care-complaint-letter-to-provider", "aged-care-quality-and-safety-commission-complaint"],
        sources: ["opan.org.au contact us", "health.gov.au OPAN contact"],
    },
    {
        slug: "switching-support-at-home-providers-checklist",
        name: "Switching Support At Home Providers Checklist",
        titleTag: "Switching Support At Home Providers Checklist",
        metaDescription: "Changing Support at Home provider? What to tell the old provider, ask the new one and check in the handover. No exit fees.",
        h1: "Switching Support At Home Providers Checklist",
        cardDesc: "What to tell the old provider, ask the new one and check in the handover.",
        cluster: "Changing",
        tool: TOOLS.budget,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "A participant can change Support at Home provider at any time, for any reason, with no exit fee. This checklist covers what to tell the old provider, what to ask the new one, and what to check in the handover.",
        blocks: [
            { type: "checklist", title: "The Checklist", items: [
                "Tell the current provider in writing as early as possible, and agree an exit date.",
                "Confirm no exit amount will be charged.",
                "Ask for copies of the care plan and records. The current provider must give records to the new provider within 28 days of the new provider's request.",
                "New provider: get a price list and a draft service agreement that starts on or after the exit date.",
                "Make sure services continue until the exit date. The old provider must keep delivering under the agreement until then.",
                "Check the budget handover. The old provider must share the remaining budget with the new provider within 28 days.",
                "Check unspent HCP funds. The participant portion goes to the new provider within 60 days.",
                "Get the final statement and final invoice from the old provider.",
            ] },
            { type: "letter", title: "The Notice Letter", body: `[Your details]
[DD/MM/YYYY]

[Provider name]

Re: Change of provider, [participant name], [client number]

Dear [name],

[participant name] has chosen to change Support at Home provider to [new provider]. We propose an exit date of [DD/MM/YYYY]. Please confirm this date in writing, continue services until then, and send the final statement, final invoice and any unspent Home Care Package fund details as required.

Kind regards,
[Name]` },
        ],
        faqs: [
            { q: "Can I change Support at Home provider at any time?", a: "Yes. A participant can change provider for any reason." },
            { q: "Are there exit fees?", a: "No. Providers cannot charge an exit amount." },
            { q: "Does my budget move with me?", a: "Yes, including unspent funds for ongoing services." },
        ],
        relatedSlugs: ["final-statement-and-unspent-funds-request", "request-service-records-visit-logs"],
        sources: ["health.gov.au Changing Support at Home providers"],
    },
    {
        slug: "registered-supporter-checklist",
        name: "Becoming A Registered Supporter Checklist",
        titleTag: "Becoming A Registered Supporter: Checklist | Wayly",
        metaDescription: "Authorised representatives were replaced by registered supporters on 01/11/2025. How to register, and what a supporter can do.",
        h1: "Becoming A Registered Supporter Checklist",
        cardDesc: "How to register as a supporter, and what a supporter can do.",
        cluster: "Family",
        tool: null,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "On 01/11/2025 the regular and authorised representative roles in My Aged Care ended and were replaced by registered supporters. A supporter helps the older person make and communicate their own decisions. Being registered does not give decision-making authority on its own, and nobody can be registered without the older person's consent.",
        blocks: [
            { type: "checklist", title: "The Checklist", items: [
                "The older person agrees and understands the role.",
                "Have both Medicare cards and contact details ready.",
                "Register by calling My Aged Care together on 1800 200 422, using the online \"Register a supporter\" form, or downloading the Registration of a Supporter form.",
                "Know your duties: act in good faith, respect the older person's decisions, and manage any conflicts of interest.",
                "If someone holds a legal appointment, such as a guardian or enduring power of attorney, ask My Aged Care how to record it.",
            ] },
        ],
        faqs: [
            { q: "What replaced the authorised representative in aged care?", a: "The registered supporter role, from 01/11/2025 under the Aged Care Act 2024." },
            { q: "Can a registered supporter make decisions?", a: "Not on that basis alone. Their role is to support the older person's own decisions." },
            { q: "Do I have to have a registered supporter?", a: "No. Nobody can require you to have one in order to get aged care." },
        ],
        relatedSlugs: ["aged-care-family-meeting-agenda", "my-aged-care-reassessment-request"],
        sources: ["health.gov.au Registered Supporters FAQ", "opan.org.au choosing your supporters"],
    },
    {
        slug: "aged-care-family-meeting-agenda",
        name: "Aged Care Family Meeting Agenda",
        titleTag: "Aged Care Family Meeting Agenda And Sibling Plan",
        metaDescription: "A one-hour family meeting agenda for aged care decisions, plus a simple plan for who does what between siblings.",
        h1: "Aged Care Family Meeting Agenda And Sibling Care Plan",
        cardDesc: "A one-hour family meeting agenda plus a simple sibling care plan.",
        cluster: "Family",
        tool: TOOLS.budget,
        disclaimer: false,
        showEscalationLadder: false,
        intro: "A clear agenda keeps a family meeting fair and focused on what the older person wants. Use the 60-minute agenda, then split the ongoing tasks between siblings so nothing falls through.",
        blocks: [
            { type: "questions", title: "Agenda (60 Minutes)", items: [
                "What does [Mum/Dad] want? They speak first, if they are present. (10 min)",
                "What's changed: health, safety, carer load. (10 min)",
                "Current care and budget: classification, quarterly budget, what's used. (10 min)",
                "Options: more services, reassessment, respite, residential. (15 min)",
                "Who does what (sibling plan below). (10 min)",
                "Next meeting date. (5 min)",
            ] },
            { type: "prose", title: "Sibling Care Plan", md: `Give each task one owner and one backup, and review it at every meeting.

| Task | Owner | Backup | Frequency |
|---|---|---|---|
| Read monthly statement | [name] | [name] | Monthly |
| Main contact with provider | [name] | [name] | As needed |
| Medical appointments | [name] | [name] | [ ] |
| Visits and social contact | [name] | [name] | [ ] |
| Bills and paperwork | [name] | [name] | [ ] |` },
        ],
        faqs: [
            { q: "Who should run an aged care family meeting?", a: "Whoever the older person trusts most to keep it fair. Their wishes come first." },
            { q: "How do siblings share aged care tasks?", a: "Give each task one owner and one backup, and review the plan at each meeting." },
            { q: "Should the older person attend?", a: "Yes, wherever possible. Decisions are theirs to make." },
        ],
        relatedSlugs: ["registered-supporter-checklist", "care-plan-review-questions"],
        sources: ["Wayly editorial"],
    },
    {
        slug: "advance-care-planning-conversation-guide",
        name: "Advance Care Planning Conversation Guide",
        titleTag: "Advance Care Planning Conversation Guide | Wayly",
        metaDescription: "Questions to start a conversation about future care wishes, before filling in the advance care directive form for your state.",
        h1: "Advance Care Planning Conversation Guide",
        cardDesc: "Questions to start a conversation about future care wishes.",
        cluster: "Family",
        tool: null,
        disclaimer: true,
        showEscalationLadder: false,
        intro: "Advance care directives are governed by state and territory law, and each has its own forms and witnessing rules, so a Wayly \"skeleton document\" could be mistaken for a valid directive. This page helps families have the conversation, then sends them to the official form for their state.",
        blocks: [
            { type: "questions", title: "Conversation Prompts", items: [
                "What matters most to you about your health and daily life?",
                "What would you not want, if you couldn't speak for yourself?",
                "Who would you trust to speak for you?",
                "Where would you prefer to be cared for?",
                "Have you told your GP?",
            ] },
            { type: "prose", title: "Where To Go Next", md: "Complete your state or territory's official form. Advance Care Planning Australia publishes them, and your GP or a lawyer can help if you are unsure." },
        ],
        faqs: [
            { q: "Is an advance care directive the same in every state?", a: "No. Each state and territory has its own law and forms." },
            { q: "Can I write my own advance care directive?", a: "Use your state's official form so it meets local requirements. Talk to your GP or a lawyer if unsure." },
            { q: "When should we have this conversation?", a: "Early, while the person can say what they want." },
        ],
        relatedSlugs: ["aged-care-family-meeting-agenda", "registered-supporter-checklist"],
        sources: ["Advance Care Planning Australia", "State and territory health departments"],
        externalLinks: [
            { label: "Advance Care Planning Australia", href: "https://www.advancecareplanning.org.au" },
        ],
    },
];

for (const t of TEMPLATES_LIBRARY) {
    t.datePublished = DATE_PUBLISHED;
    t.dateModified = DATE_PUBLISHED;
    t.lastChecked = LAST_CHECKED;
}

export function getTemplateBySlug(slug) {
    return TEMPLATES_LIBRARY.find((t) => t.slug === slug) || null;
}
