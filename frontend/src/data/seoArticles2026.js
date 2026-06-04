/**
 * Three SEO/AEO articles for family caregivers, added Nov 2026.
 * Structured so the ArticleDetail renderer can produce a TOC, a styled
 * Key Takeaways callout, GFM tables, blockquotes, and an accessible FAQ
 * accordion — without us redesigning the existing article template.
 */
export const SEO_ARTICLES_2026 = [
    {
        slug: "support-at-home-statement",
        title: "How to read your Support at Home statement and spot when something looks off",
        excerpt: "A plain English guide to reading your Support at Home monthly statement, checking the 10% care fee and spotting charges that look wrong.",
        published_at: "2026-11-21",
        updated_at: "2026-11-21",
        author: { name: "Antony Chiware", role: "Wayly" },
        reviewer: { name: "[Reviewed by: TBC]", role: "" },
        hero_alt: "Adult daughter reading her father's Support at Home statement on a laptop",
        meta: {
            title: "How to Read Your Support at Home Statement",
            description: "A plain English guide to reading your Support at Home monthly statement, checking the 10% care fee and spotting charges that look wrong.",
        },
        key_takeaways: [
            "Providers must send a monthly statement under Support at Home, even though budgets are released quarterly.",
            "Care management is capped at 10% of the quarterly budget, a big drop from the old Home Care Package fees that sometimes ran much higher.",
            "You can carry over $1,000 or 10% of your quarterly budget to the next quarter, whichever is greater.",
            "Clinical care such as nursing and physiotherapy should show a $0 contribution from your parent.",
            "From May 2026 the Aged Care Quality and Safety Commission can order providers to refund money where they have overcharged.",
        ],
        intro_md: `If you help look after a parent's care from a distance, the monthly Support at Home statement is one of the few clear windows you get into what is actually happening with their funding. The trouble is that these statements are not always easy to read, and a lot of families just file them away without checking.

That is a mistake worth fixing. Under the Support at Home program, every registered provider must send a [monthly statement](https://www.health.gov.au/our-work/support-at-home) to each participant, even in a month where no services were delivered. The statement shows how much funding was available, what was spent, what you contributed, and what is left. Once you know what each line means, you can catch billing errors, unexpected fees and services that were charged but never delivered.

This guide walks through what is on the statement, what the numbers should look like, and the warning signs that are worth a phone call. Tools like Wayly, an Australian AI concierge built for Support at Home, can read these statements for you and flag anything unusual, but it helps to understand the basics yourself first.`,
        sections: [
            {
                heading: "Why do I get a monthly statement when the budget is quarterly?",
                body_md: `Support at Home funding is released in four quarterly budgets across the year, in July, October, January and April. Even so, the rules require your provider to send a statement every single month.

Think of it as a progress snapshot rather than a bill. It tells you how fast the quarterly budget is being used and whether the spending matches the care plan. The statement for July, for example, must be provided by 31 August.

Getting a statement every month matters because it gives you regular chances to catch problems early, instead of finding out three months later that the budget ran dry in week six.`,
            },
            {
                heading: "What is actually on a Support at Home statement?",
                body_md: `Statements look different from one provider to the next, but the Department of Health, Disability and Ageing has set out the information every statement must include. Here is what to look for.

| Section | What it should show |
|---|---|
| Statement period | The calendar month the statement covers |
| Opening balance | Funds carried in from the previous month or quarter |
| Services delivered | Each service as a line item, including cancellations and no-shows |
| Participant contributions | Any amount your parent paid towards a service |
| Care management | The units or hours of care management delivered that month |
| Adjustments or refunds | Corrections from previous months |
| AT-HM items | Committed funds and expiry dates for assistive technology and home modifications |
| Closing balance | What is left for the rest of the quarter |

If your parent previously had a Home Care Package, the statement may also show unspent Home Care Package funds. These are held in a separate pool, and there is no carryover limit on them.`,
            },
            {
                heading: "How much should the care management fee be?",
                body_md: `This is the single biggest thing to check. Under Support at Home, care management is capped at 10% of the quarterly budget. Your provider cannot charge more than that.

This is a real improvement on the old system. Under Home Care Packages, some providers charged a lot more once you added together care management and package administration fees. The flat 10% cap is one of the clearest wins of the reform.

So if your parent is on Classification 4, with an annual budget of $29,696 and a quarterly budget of about $7,424, care management should be no more than roughly $742 for the quarter. If you see a figure well above 10%, query it.

A quick note on Wayly here. One of the most common reasons families sign up is that they want a second set of eyes on this exact number every month without having to do the maths themselves.`,
            },
            {
                heading: "What should clinical care cost my parent?",
                body_md: `Nothing. Clinical services such as nursing, physiotherapy, occupational therapy and podiatry are fully funded by the government when they are on the approved care plan. Your parent's contribution for these should always read $0.

The other two service categories are different. Independence services, such as personal care and help with mobility, attract a moderate contribution. Everyday living services, such as cleaning, gardening and meal preparation, attract the highest contribution.

If you spot a contribution charged against a nursing visit or a physio session, that is a red flag worth raising straight away.

There is also a change coming. From 1 October 2026, the government will [fully fund personal care services](https://www.myagedcare.gov.au/support-at-home-costs-and-contributions), which include showering, dressing and continence support. After that date, your parent should not be paying a contribution for personal care either.`,
            },
            {
                heading: "What are the warning signs on a statement?",
                body_md: `Most providers do the right thing, but mistakes happen and they are easier to fix when you catch them quickly. Here is a checklist of things worth a closer look.

- A care management fee above 10% of the quarterly budget.
- A contribution charged against a clinical service that should be free.
- Services listed that your parent says never happened.
- Charges for travel, admin or "package management" on top of the service price. Under Support at Home the price of a service is meant to include everything.
- A budget being used much faster than expected, which can leave gaps later in the quarter.
- Unspent funds that vanish without explanation. You can carry over $1,000 or 10% of the quarterly budget, whichever is greater. Anything above that does not roll over.

If something looks wrong, raise it with the provider first. They can usually check it against their records and Services Australia. If you are not satisfied, the [Older Persons Advocacy Network](https://opan.org.au) runs a free advocacy line on 1800 700 600, and you can complain to the [Aged Care Quality and Safety Commission](https://www.agedcarequality.gov.au).

As of May 2026, the Commission has new powers to order providers to pay refunds where they have overcharged, and to take regulatory action against providers who fail to issue monthly statements. That makes checking the statement more useful than ever, because there is now a clear path to getting money back.`,
            },
            {
                heading: "How can I keep track when I live far away?",
                body_md: `This is the hard part for a lot of families. You might be in Sydney while your mum is in regional Queensland, and a paper statement that arrives at her house is not much use to you.

A few practical steps help. Ask the provider to email statements to you as well, with your parent's consent. Set a recurring reminder to read each statement the week it arrives. Keep a simple running note of the quarterly budget and how much is left.

This is also where Wayly earns its keep. It [reads each monthly statement](/features), [tracks the quarterly budget](/features) across the three streams of Clinical Care, Independence and Everyday Living, and flags charges that look off, so you are not relying on memory or a shoebox of PDFs.`,
            },
            {
                heading: "The bottom line",
                body_md: `Your parent's Support at Home statement is not just paperwork. It is the clearest record you have of whether the funding is being spent the way it should be. Check the 10% care management cap, make sure clinical care reads $0, watch for services that never happened, and keep an eye on the rollover limit.

If you would rather have those checks done for you every month, Wayly can read the statement, track the budget and tell you when something needs a closer look. [Try Wayly free for 7 days](/signup).`,
            },
        ],
        faqs: [
            { q: "Do I get a Support at Home statement every month?", a: "Yes. Providers must issue a statement every month, even if no services were delivered that month, although budgets are released quarterly." },
            { q: "How much is the care management fee under Support at Home?", a: "Care management is capped at 10% of the quarterly budget. A provider cannot charge more than that." },
            { q: "Should my parent pay anything for nursing or physio?", a: "No. Clinical services on the approved care plan are fully government funded, so the contribution should be $0." },
            { q: "What can I do if I think we have been overcharged?", a: "Raise it with the provider first. From May 2026 the Aged Care Quality and Safety Commission can order refunds where overcharging is found. You can also call the OPAN advocacy line on 1800 700 600." },
            { q: "How much unspent funding can roll over to the next quarter?", a: "You can carry over $1,000 or 10% of the quarterly budget, whichever is greater. Amounts above that do not carry over." },
        ],
        related: [
            "wayly-statement-decoder-support-at-home-statement-explained",
            "wayly-budget-calculator-support-at-home-quarterly-budget",
            "home-care-package-vs-support-at-home",
            "support-at-home-costs-and-contributions",
        ],
    },
    {
        slug: "home-care-package-vs-support-at-home",
        title: "Home Care Package vs Support at Home: what actually changed for your family",
        excerpt: "What changed when Support at Home replaced Home Care Packages, the no worse off rule, the 8 levels and what it means for your parent.",
        published_at: "2026-11-21",
        updated_at: "2026-11-21",
        author: { name: "Antony Chiware", role: "Wayly" },
        reviewer: { name: "[Reviewed by: TBC]", role: "" },
        hero_alt: "Older woman at home with her adult son discussing aged care funding",
        meta: {
            title: "Home Care Package vs Support at Home Explained",
            description: "What changed when Support at Home replaced Home Care Packages, the no worse off rule, the 8 levels and what it means for your parent.",
        },
        key_takeaways: [
            "Support at Home replaced Home Care Packages on 1 November 2025.",
            "Home Care Packages had 4 levels. Support at Home has 8 classifications, plus 4 transitioned levels for people who moved across.",
            "The \"no worse off\" principle protects people who had a package, or were approved for one, on or before 12 September 2024.",
            "Funding is now released quarterly rather than as one annual pool, and care management is capped at 10%.",
            "Services are sorted into 3 streams: Clinical Care, Independence and Everyday Living.",
        ],
        intro_md: `If your parent was on a Home Care Package, you have probably had a few confusing letters land in the last several months. The program your family relied on is gone, and a new one called Support at Home has taken its place.

[Support at Home replaced Home Care Packages](https://www.health.gov.au/our-work/support-at-home/about) and the Short-Term Restorative Care programme on 1 November 2025. The good news is that nobody had to reapply, and the protections built into the change mean most existing recipients are no worse off. The less good news is that the rules, the funding levels and the fees all work a bit differently now.

This article explains what changed, what stayed the same, and what it means for the day to day care of someone you love. If you want help keeping track of the new quarterly budget once you understand it, Wayly is an Australian AI concierge built specifically for the Support at Home program.`,
        sections: [
            {
                heading: "Is Support at Home just a new name for Home Care Packages?",
                body_md: `No, although the goal is the same, which is to help older people stay in their own home for longer. The structure underneath is different in several important ways.

The biggest visible change is the number of funding levels. Home Care Packages had four levels. Support at Home has eight ongoing classifications, which lets the funding match a person's needs more closely, especially if their needs sat awkwardly between two of the old levels.

There is also a single national assessment now. The old Aged Care Assessment Team and Regional Assessment Service were merged into the Single Assessment System in December 2024, using one tool called the Integrated Assessment Tool. Most families still say "ACAT assessment" out of habit, but it is now one process.`,
            },
            {
                heading: "How do the funding levels compare?",
                body_md: `Here is roughly how the money lines up. Support at Home figures are the annual amounts that took effect on 1 November 2025, and they are indexed each year on 1 July.

| Support at Home classification | Approximate annual budget |
|---|---|
| Classification 1 | $10,731 |
| Classification 2 | $16,034 |
| Classification 3 | $21,966 |
| Classification 4 | $29,696 |
| Classification 5 | $39,697 |
| Classification 6 | $48,114 |
| Classification 7 | $58,148 |
| Classification 8 | $78,106 |

If your parent already had a Home Care Package, they were not dropped straight into these eight classifications. Instead they moved onto a transitioned level that keeps the same funding they had before. The four transitioned levels are roughly $10,987 for old Level 1, $19,319 for Level 2, $42,055 for Level 3 and $63,758 for Level 4.

If their needs increase and they are reassessed, they then move into one of the eight new classifications.`,
            },
            {
                heading: "What is the \"no worse off\" rule?",
                body_md: `This is the protection that matters most for existing recipients. If your parent was receiving, or was approved for, a Home Care Package on or before 12 September 2024, the [no worse off principle](https://www.myagedcare.gov.au/support-at-home-costs-and-contributions) applies.

In plain terms, they will pay the same or less under Support at Home than they would have under the old package rules. If they were assessed as not having to pay an income-tested care fee, they will never be asked to pay contributions under Support at Home. This protection holds even if they are later reassessed into a higher classification.

People in this group also keep a lower lifetime contribution cap of $84,571.66, compared with the higher cap that applies to brand new participants.

This is genuinely good news, and it is worth confirming. Check your parent's letters from My Aged Care and Services Australia to see which arrangements apply to them.`,
            },
            {
                heading: "How does the money work now?",
                body_md: `Three changes are worth understanding.

First, the budget is now quarterly. Instead of one annual pool, the funding arrives in four budgets across the year. If you do not use the whole quarterly budget, you can carry over $1,000 or 10% of it, whichever is greater. Anything above that does not roll over, so leaving large amounts unspent is no longer a good strategy.

Second, care management is capped at 10% of the quarterly budget. Under the old system, combined fees could be much higher.

Third, services are sorted into three streams. Clinical Care, such as nursing and allied health, is fully government funded. Independence services, such as personal care, attract a moderate contribution. Everyday Living services, such as cleaning and gardening, attract the highest contribution.

Keeping track of a quarterly budget split across three streams is fiddly, and it is exactly the kind of job Wayly is built for. It [tracks what has been spent](/features), what is left and whether the care management fee is within the cap.`,
            },
            {
                heading: "What about unspent Home Care Package money?",
                body_md: `If your parent had unspent Home Care Package funds as at 31 October 2025, they keep them. These sit in a separate pool from the new quarterly budget, and the $1,000 carryover limit does not apply to them.

That money can be used for assistive technology and home modifications, or for extra services once the quarterly budget is spent. If your parent changes providers, the unspent funds move with them.`,
            },
            {
                heading: "Has anything to do with fees changed in 2026?",
                body_md: `Yes, and this is where a lot of older articles are now wrong. Two changes are worth knowing.

First, price caps that were due to start on 1 July 2026 have been deferred. In May 2026 the Minister for Aged Care, Sam Rae, announced the caps would be delayed because of concerns about market volatility. Health Minister Mark Butler told ABC Radio National:

> We do not want to set in place a price cap that leads to unintended consequences, particularly that see prices go up.

There is no new start date. In the meantime, providers set their own prices, but they must publish them, and the Aged Care Quality and Safety Commission gained new powers to order refunds for overcharging.

Second, from 1 October 2026 the government will fully fund personal care services such as showering, dressing and continence support. These move into the Clinical Care category, so contributions for them will drop to zero.`,
            },
            {
                heading: "What should I actually do now?",
                body_md: `If you are helping a parent through the change, here is a simple list.

- Confirm whether the no worse off rule applies, by checking the assessment date of 12 September 2024.
- Find out which classification or transitioned level they are on, and the quarterly budget that goes with it.
- Ask the provider for their current published price list and keep a copy.
- Check the care management fee is within the 10% cap.
- If their needs have grown, call [My Aged Care on 1800 200 422 to request a reassessment](https://www.myagedcare.gov.au).

For independent help, [COTA Australia](https://www.cota.org.au) publishes plain-English explainers and runs a national advocacy network.`,
            },
            {
                heading: "The bottom line",
                body_md: `Support at Home is not just a rebrand. It brings more funding levels, quarterly budgets, a 10% care management cap and clearer service streams. For most existing recipients the no worse off rule means costs should not rise because of the change. The job for families now is to understand the new structure and keep an eye on the budget.

If that feels like a lot to stay on top of from a distance, Wayly can track the quarterly budget and statements for you and flag anything that needs attention. [Try Wayly free for 7 days](/signup).`,
            },
        ],
        faqs: [
            { q: "When did Support at Home replace Home Care Packages?", a: "On 1 November 2025. Existing recipients moved across automatically and did not need to reapply." },
            { q: "How many levels does Support at Home have?", a: "Eight ongoing classifications, plus four transitioned levels for people who moved over from a Home Care Package." },
            { q: "Will my parent pay more under Support at Home?", a: "If they were receiving or approved for a package on or before 12 September 2024, the no worse off rule means they pay the same or less." },
            { q: "Do the unspent Home Care Package funds disappear?", a: "No. Unspent funds held as at 31 October 2025 are kept in a separate pool with no carryover limit." },
            { q: "Are the Support at Home price caps still starting on 1 July 2026?", a: "No. The government deferred the caps in May 2026 with no new date set. Providers set their own published prices for now." },
        ],
        related: [
            "wayly-provider-price-checker-support-at-home-prices",
            "wayly-contribution-estimator-support-at-home-fees",
            "support-at-home-statement",
            "support-at-home-costs-and-contributions",
        ],
    },
    {
        slug: "support-at-home-costs-and-contributions",
        title: "What will Support at Home actually cost? A 2026 guide to fees and contributions",
        excerpt: "What you pay under Support at Home in 2026: contribution rates, the 10% fee, the lifetime cap, the price cap delay and how to estimate costs.",
        published_at: "2026-11-21",
        updated_at: "2026-11-21",
        author: { name: "Antony Chiware", role: "Wayly" },
        reviewer: { name: "[Reviewed by: TBC]", role: "" },
        hero_alt: "Family using the My Aged Care Support at Home fee estimator on a tablet",
        meta: {
            title: "Support at Home Costs and Fees: 2026 Guide",
            description: "What you pay under Support at Home in 2026: contribution rates, the 10% fee, the lifetime cap, the price cap delay and how to estimate costs.",
        },
        key_takeaways: [
            "Clinical care such as nursing and physiotherapy is fully funded. Your parent pays nothing for it.",
            "Contributions apply to Independence and Everyday Living services, and depend on income, assets and pension status.",
            "Full pensioners pay the lowest rates. Self-funded retirees pay the most.",
            "There is a lifetime cap on contributions, set at $135,318.69 for new participants as at September 2025 and indexed twice a year.",
            "Price caps that were due on 1 July 2026 have been deferred, so providers set their own prices for now.",
        ],
        intro_md: `"How much is this going to cost?" is usually the first question families ask when a parent is approved for Support at Home, and it is surprisingly hard to get a straight answer. The cost depends on your parent's income and assets, the type of services they use, and the prices their provider charges.

The good news is that the structure is more predictable than the old Home Care Package system, and there is a free government tool that gives you a personalised estimate. This guide explains how the fees work in 2026, including the price cap change that has caught a lot of people out, and how to estimate what your family will pay.

If you want to keep track of the actual contributions once care starts, rather than just the estimate, Wayly is an Australian AI concierge that reads the monthly statements and [tracks spending for you](/features).`,
        sections: [
            {
                heading: "How are Support at Home costs worked out?",
                body_md: `There are two separate pieces to the cost, and it helps to keep them apart.

The first is the service price. This is what the provider charges to deliver a service, such as an hour of personal care or a house clean. Each provider sets its own prices, and they must publish them.

The second is your parent's contribution. This is the share of that price they pay themselves, set as a percentage. The government pays the rest as a subsidy. Your parent's percentage depends on their income, assets and pension status, which Services Australia works out through an [income and assets assessment](https://www.health.gov.au/our-work/support-at-home).

So the dollar amount your parent pays is their contribution percentage applied to the provider's service price. A lower price or a lower percentage both reduce the out of pocket cost.`,
            },
            {
                heading: "What are the contribution rates?",
                body_md: `This is the part most families want spelled out. Contributions depend on the service category and the person's financial situation. Clinical care is always free. The other two categories work like this.

| Pension status | Clinical care | Independence services | Everyday living services |
|---|---|---|---|
| Full pensioner | 0% | 5% | 17.5% |
| Part pensioner or Commonwealth Seniors Health Card holder | 0% | Between 5% and 50% | Between 17.5% and 80% |
| Self-funded retiree, no card | 0% | 50% | 80% |

So a full pensioner getting an hour of personal care might pay 5% of the cost, while a self-funded retiree getting a house clean might pay 80%. The government covers the rest in both cases.

If your parent does not complete an income and assets assessment, they are treated as "means not disclosed" and charged the maximum rate. So even if their finances are simple, it is worth completing the assessment.`,
            },
            {
                heading: "Is there a limit on what my parent can pay?",
                body_md: `Yes. There is a lifetime cap on contributions. Once your parent reaches it, they stop paying contributions for non-clinical services for the rest of their life, whether the care is at home or in residential aged care.

For new participants the cap is $135,318.69 as at 20 September 2025, and it is indexed on 20 March and 20 September each year. People protected by the no worse off rule have a lower cap of $84,571.66.

If your parent cannot afford their contributions, financial hardship assistance is available through Services Australia on 1800 227 475. If approved, the government covers some or all of the contributions.`,
            },
            {
                heading: "What happened to the 1 July 2026 price caps?",
                body_md: `This is the most important update for 2026, and a lot of online guides still have it wrong.

Price caps were due to start on 1 July 2026. They would have set a maximum price for each service. In May 2026 the Minister for Aged Care, Sam Rae, announced the caps were being deferred, saying:

> Older Australians and their families told us they need stronger protections against rogue market prices.

He pointed to the risk of setting caps in a volatile market. No new start date has been set.

So for now, providers set their own prices. That makes comparing providers more important than it would have been with caps in place. The government has added some protections in the meantime. The [Aged Care Quality and Safety Commission](https://www.agedcarequality.gov.au) can now order refunds where a provider has overcharged. A quarterly National Summary of Support at Home Prices will show median prices and ranges so families can compare. Providers are being encouraged to limit price rises to no more than twice a year.

Because there is no hard ceiling on prices right now, checking your parent's statement each month is the practical safeguard. This is one of the main reasons families use Wayly, which [flags charges that look out of line](/features) with what a service should cost.`,
            },
            {
                heading: "Is there a Support at Home fees calculator?",
                body_md: `Yes. My Aged Care has a free [Support at Home fee estimator](https://www.myagedcare.gov.au/support-at-home-fee-estimator) and budget planner. It asks about your parent's assessment status, partner status, pension status and finances, then estimates their contribution rates. You can then add the services they expect to use and adjust the amounts to match a provider's price list.

It does not ask for personally identifying details, just general income and asset information. There is an income and assets checklist on the My Aged Care website to help you gather what you need first.

A word of caution. The estimator gives a guide, not a final figure. Services Australia determines the actual contribution, and the family home is exempt from the asset test for Support at Home. For anything complex, such as decisions about the family home or large assets, it is worth speaking to a specialist aged care financial adviser. Services Australia also offers free [Financial Information Service](https://www.myagedcare.gov.au/financial-support-and-advice) officers.`,
            },
            {
                heading: "What does this look like in practice?",
                body_md: `A quick worked example helps. Say a self-funded retiree without a concession card uses a house clean priced at $60. That is an Everyday Living service, so at 80% they pay $48 and the government pays $12.

The same person has a nursing visit priced at $120. That is clinical care, so they pay $0 and the government pays the full $120.

This is why two people on the same classification can end up paying very different amounts. It comes down to the mix of services they use and their financial situation, not just the level they are on.`,
            },
            {
                heading: "The bottom line",
                body_md: `Support at Home costs are made of two parts, the provider's price and your parent's contribution percentage. Clinical care is free, Independence and Everyday Living services are means tested, and there is a lifetime cap that protects against open-ended costs. The price caps that were meant to start in July 2026 have been delayed, so comparing provider prices and checking statements matters more than ever.

Start with the My Aged Care fee estimator to get a guide, then let Wayly keep track of the real contributions once care begins. [Try Wayly free for 7 days](/signup).`,
            },
        ],
        faqs: [
            { q: "How much does Support at Home cost?", a: "It depends on the provider's prices and your parent's contribution percentage. Clinical care is free. Independence and Everyday Living services are means tested, ranging from 5% to 80% of the service price." },
            { q: "Is there a free calculator for Support at Home fees?", a: "Yes. My Aged Care has a free Support at Home fee estimator and budget planner that gives a personalised estimate based on income, assets and pension status." },
            { q: "Do full pensioners pay for Support at Home?", a: "They pay nothing for clinical care, 5% for Independence services and 17.5% for Everyday Living services. These are the lowest rates." },
            { q: "Did the Support at Home price caps start on 1 July 2026?", a: "No. The government deferred the caps in May 2026 and has not set a new date. Providers set their own published prices for now." },
            { q: "Is there a limit on total contributions?", a: "Yes. There is a lifetime cap, set at $135,318.69 for new participants as at September 2025 and indexed twice a year. People protected by the no worse off rule have a lower cap of $84,571.66." },
        ],
        related: [
            "wayly-budget-calculator-support-at-home-quarterly-budget",
            "wayly-contribution-estimator-support-at-home-fees",
            "wayly-care-plan-reviewer-support-at-home-care-plan",
            "support-at-home-statement",
            "home-care-package-vs-support-at-home",
        ],
    },
];
