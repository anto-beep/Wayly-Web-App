// =============================================================================
// Wayly Editorial Production Rule (effective Feb 2026):
//   - Every article ships under the byline "Wayly Editorial".
//   - `published_at` and `updated_at` MUST be set to TODAY's date (YYYY-MM-DD)
//     when an article is pushed to Production. Never future-date. Never carry
//     over an old date when meaningful content changes.
//   - All article dates must fall within the last 8 months from the day they
//     ship. If the article is a refresh, set both fields to today.
// =============================================================================

/**
 * Three SEO/AEO articles for family caregivers, added Nov 2026.
 * Structured so the ArticleDetail renderer can produce a TOC, a styled
 * Key Takeaways callout, GFM tables, blockquotes, and an accessible FAQ
 * accordion, without us redesigning the existing article template.
 */
export const SEO_ARTICLES_2026 = [
    {
        slug: "support-at-home-statement",
        title: "How to Read Your Support at Home Statement and Spot When Something Looks Off",
        excerpt: "A plain English guide to reading your Support at Home monthly statement, checking the 10% care fee and spotting charges that look wrong.",
        published_at: "2025-12-08",
        updated_at: "2025-12-08",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
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
        title: "Home Care Package vs Support at Home: What Actually Changed for Your Family",
        excerpt: "What changed when Support at Home replaced Home Care Packages, the no worse off rule, the 8 levels and what it means for your parent.",
        published_at: "2026-02-12",
        updated_at: "2026-02-12",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
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
        title: "What Will Support at Home Actually Cost? A 2026 Guide to Fees and Contributions",
        excerpt: "What you pay under Support at Home in 2026: contribution rates, the 10% fee, the lifetime cap, the price cap delay and how to estimate costs.",
        published_at: "2026-04-19",
        updated_at: "2026-04-19",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
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

The second is your parent's contribution. This is the share of that price they pay themselves, set as a rate. The government pays the rest as a subsidy. Your parent's percentage depends on their income, assets and pension status, which Services Australia works out through an [income and assets assessment](https://www.health.gov.au/our-work/support-at-home).

So the dollar amount your parent pays is their contribution rate applied to the provider's service price. A lower price or a lower percentage both reduce the out of pocket cost.`,
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
                body_md: `Support at Home costs are made of two parts, the provider's price and your parent's contribution rate. Clinical care is free, Independence and Everyday Living services are means tested, and there is a lifetime cap that protects against open-ended costs. The price caps that were meant to start in July 2026 have been delayed, so comparing provider prices and checking statements matters more than ever.

Start with the My Aged Care fee estimator to get a guide, then let Wayly keep track of the real contributions once care begins. [Try Wayly free for 7 days](/signup).`,
            },
        ],
        faqs: [
            { q: "How much does Support at Home cost?", a: "It depends on the provider's prices and your parent's contribution rate. Clinical care is free. Independence and Everyday Living services are means tested, ranging from 5% to 80% of the service price." },
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
    // -----------------------------------------------------------------
    // Added Jun 2026, published exactly as supplied, canonical at /articles/<slug>
    // -----------------------------------------------------------------
    {
        slug: "support-at-home-personal-care-free-october-2026",
        canonical_path: "/articles/support-at-home-personal-care-free-october-2026",
        title: "Personal Care Becomes Free Under Support at Home From 1 October 2026",
        excerpt: "From 1 October 2026, showering, dressing and continence support under Support at Home cost families nothing. What changes, what to check, in plain English.",
        published_at: "2026-06-24",
        updated_at: "2026-06-24",
        author: { name: "Wayly Editorial", role: "Wayly" },
        hero_alt: "Adult daughter sitting beside her father at home reviewing a Support at Home statement",
        meta: {
            title: "Personal Care Free From 1 October 2026 | Wayly",
            description: "From 1 October 2026, showering, dressing and continence support under Support at Home cost families nothing. What changes, what to check, in plain English.",
        },
        intro_md: `From 1 October 2026, help with showering, dressing and continence support will cost Support at Home families nothing. Here is what is changing, why it matters for your budget, and exactly what to check on your statements when the date arrives.`,
        sections: [
            {
                heading: "The short version",
                body_md: `On 22 April 2026, the government announced a significant change to Support at Home. From 1 October 2026, personal care moves from the Independence category into the Clinical Care category.

That one sentence has a real dollar effect. Services in the Clinical Care category are fully government funded. Participants pay no contribution for them. Services in the Independence category attract a means tested contribution of between 5% and 50% of the service cost, depending on the participant's financial situation.

So from 1 October 2026, the personal care visits your parent receives every week stop carrying a contribution. The government covers the full cost.`,
            },
            {
                heading: "What counts as personal care",
                body_md: `Personal care covers the hands on support with daily living that many families rely on most. It includes:

- Help with showering and bathing
- Help with dressing and grooming
- Continence support
- Help moving safely around the home, such as transfers in and out of bed or a chair

If your parent's care plan includes any of these, this change applies to you.`,
            },
            {
                heading: "What is not changing",
                body_md: `It is just as important to know what stays the same.

Everyday Living services keep their contributions. Cleaning, gardening, meal delivery and similar services still attract a means tested contribution of between 17.5% and 80%.

Other Independence services keep their contributions too. Social support, transport and allied health services that sit in the Independence category are not part of this change. Only personal care moves.

Your classification and budget do not change because of this. The quarterly budget your parent receives is set by their classification, not by which category a service sits in. What changes is how much of the personal care cost comes out of your family's pocket. From 1 October 2026 the answer is nothing.

One more thing worth knowing. Earlier this year the government also deferred the price caps that were due to start on 1 July 2026. Providers continue to set their own prices for now, which makes it more important, not less, to check what your provider charges against their published price list.`,
            },
            {
                heading: "What this means in real dollars",
                body_md: `Here is a worked example. The names are fictional but the maths is real.

Dorothy is 79, lives in Geelong, and receives three personal care visits a week of one hour each. Her provider charges $85 per hour for personal care. Dorothy is a part pensioner, and her means tested contribution rate for Independence services is 15%.

Before 1 October 2026, Dorothy's family contributes 15% of each visit. That is $12.75 per visit, $38.25 per week, and around $1,989 per year.

From 1 October 2026, that contribution drops to zero. Same visits, same care worker, same provider. The government covers the full cost.

Every household's numbers are different because contribution rates are means tested. A full pensioner pays the lowest rates, while a self funded retiree without a Commonwealth Seniors Health Card can pay up to 50% on Independence services today. The higher your current contribution rate, the bigger your saving from October. If you want to see your own household's numbers, the [Wayly Contribution Estimator](/articles/wayly-contribution-estimator-support-at-home-fees) models contributions for your situation, and our [costs and contributions guide](/articles/support-at-home-costs-and-contributions) explains how the rates work.`,
            },
            {
                heading: "There is a second, quieter benefit",
                body_md: `Support at Home has a lifetime contribution cap. Once a participant's total contributions reach the cap, they stop paying contributions altogether. The cap only accrues from non clinical contributions.

Because personal care contributions stop counting from 1 October 2026, families with heavy personal care needs will accrue toward the lifetime cap more slowly. For households where a parent might one day move into residential aged care, where the same combined cap applies, this slower accrual can matter years down the track.`,
            },
            {
                heading: "The transition detail that catches people out",
                body_md: `The change applies to services delivered from 1 October 2026. It is based on when the service happens, not when it is billed.

Personal care delivered on 30 September 2026 still attracts a contribution, even though the invoice for it will likely arrive in your October statement. Personal care delivered on 1 October 2026 should show a contribution of zero.

This is exactly the kind of boundary where billing mistakes happen. Provider systems need to be updated on time, and not all of them will be.`,
            },
            {
                heading: "What to check on your statements",
                body_md: `Here is your checklist for the transition.

First, look at your September statement when it arrives in October. Personal care delivered in September should still show your normal contribution. That is correct.

Second, look closely at your October statement when it arrives in November. Every personal care line for services dated 1 October 2026 or later should show a participant contribution of $0.00. If any personal care visit dated October or later still shows a contribution, query it with your provider straight away and ask for a corrected statement.

Third, check the category labels. Personal care should appear under Clinical Care from October, not under Independence. A service sitting in the wrong category is one of the most common ways families end up paying contributions they do not owe.

If reading the statement line by line sounds like hard work, that is the exact job the [Wayly Statement Decoder](/articles/wayly-statement-decoder-support-at-home-statement-explained) does. Drop in the statement and it checks every line, flags anything still carrying a personal care contribution after 1 October, and drafts the query to your provider for you. Our guide on [how to read your Support at Home statement](/articles/how-to-read-your-support-at-home-statement) walks through the statement format in detail.`,
            },
            {
                heading: "What to do between now and October",
                body_md: `You do not need to apply for anything. The change happens automatically for every Support at Home participant.

That said, there are three sensible steps to take now.

Review the care plan. If your parent has been holding back on personal care hours because of the contribution cost, October changes that equation. It may be worth talking to your provider about whether the care plan still reflects what your parent actually needs. The [Wayly Budget Calculator](/articles/wayly-budget-calculator-support-at-home-quarterly-budget) can show you how a change in hours fits within the quarterly budget.

Know your current contribution rate. Dig out the most recent letter from Services Australia that sets out your parent's contribution rates. That letter tells you exactly how much you are paying on personal care today, which is the amount you will stop paying in October.

Diarise the statement check. Put a note in your calendar for mid November to check the October statement. The transition month is the one most likely to contain errors.`,
            },
            {
                heading: "Where this information comes from",
                body_md: `The change was announced by the government on 22 April 2026 and takes effect on 1 October 2026. You can read the official program information at the [Department of Health's Support at Home pages](https://www.health.gov.au/our-work/support-at-home) and at [My Aged Care](https://www.myagedcare.gov.au). Wayly is independent of providers and government. We help families understand the system. For decisions about your specific financial situation, speak to Services Australia or a licensed financial adviser.`,
            },
        ],
        faqs: [
            {
                q: "Is personal care free under Support at Home?",
                a: "From 1 October 2026, yes. Personal care moves into the Clinical Care category, which is fully government funded with no participant contribution. Before that date, personal care sits in the Independence category and attracts a means tested contribution of between 5% and 50%.",
            },
            {
                q: "When exactly does personal care become free?",
                a: "The change applies to personal care services delivered on or after 1 October 2026. It is based on the date the service is delivered, not the date it is billed. Services delivered before 1 October 2026 still attract a contribution even if they appear on a later statement.",
            },
            {
                q: "What counts as personal care under Support at Home?",
                a: "Personal care includes help with showering and bathing, dressing and grooming, continence support, and help moving safely around the home. It does not include cleaning, gardening or meal services, which remain in the Everyday Living category with their own contributions.",
            },
            {
                q: "Will I get a refund for personal care contributions paid before October 2026?",
                a: "No. Contributions correctly charged for services delivered before 1 October 2026 were charged under the rules that applied at the time. The change is not backdated. If you believe you were charged incorrectly at any time, that is a separate matter to raise with your provider.",
            },
            {
                q: "Does this change my parent's classification or quarterly budget?",
                a: "No. Classifications and quarterly budgets are unchanged. What changes is the participant contribution on personal care services, which drops to zero from 1 October 2026.",
            },
            {
                q: "What should I check on the statement after 1 October 2026?",
                a: "Check that every personal care line dated 1 October 2026 or later shows a participant contribution of $0.00, and that personal care appears under Clinical Care rather than Independence. If either is wrong, query it with your provider and ask for a corrected statement.",
            },
        ],
        related: [
            "support-at-home-costs-and-contributions",
            "how-to-read-your-support-at-home-statement",
            "wayly-contribution-estimator-support-at-home-fees",
        ],
    },
    // -----------------------------------------------------------------
    // July 2026 · Wayly editorial batch (SEO/AEO research-led).
    // Topic 1: Contributions / income and assets assessment.
    // Topic 2: Switching Support at Home providers.
    // Monetary constants: post-20-March-2026 indexation. Re-verify after
    // the 20 September 2026 indexation and update `updated_at`.
    // -----------------------------------------------------------------
    {
        slug: "how-much-will-i-pay-for-support-at-home",
        title: "How Much Will I Actually Pay for Support at Home? The Income and Assets Assessment Explained",
        excerpt: "A plain-English guide to Support at Home contributions in 2026. What full pensioners, part pensioners and self-funded retirees really pay, how the income and assets assessment works, and how to lower your bill legitimately.",
        published_at: "2026-07-25",
        updated_at: "2026-07-25",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Adult daughter and mother reading a Support at Home contribution letter at the kitchen table",
        meta: {
            title: "Support at Home contributions 2026: how much will I actually pay?",
            description: "Full pensioners pay 5% and 17.5%. Self-funded retirees pay up to 50% and 80%. Here is what those percentages mean for your household, and how to pay less legitimately.",
        },
        key_takeaways: [
            "Clinical care under Support at Home is fully government-funded. You only contribute towards independence and everyday living services.",
            "Full pensioners contribute 5% for independence and 17.5% for everyday living. Self-funded retirees contribute up to 50% and 80%. Part pensioners and Commonwealth Seniors Health Card holders sit between those bands based on Services Australia's income and assets test.",
            "The standard lifetime cap is $137,917.01 (indexed 20 March 2026). Once you reach it, you pay nothing more, ever. Grandfathered participants have a lower $86,185.23 cap under the 'no worse off' principle.",
            "The income and assets assessment (form SA456) is voluntary but skipping it means you are charged the maximum rate. Completing it can be the single fastest way to lower your bill.",
            "From 1 October 2026, personal care becomes fully government-funded for everyone. That is a real cut in monthly contributions for most participants using personal care.",
            "If you can genuinely not afford the contribution even at the correct rate, financial hardship assistance (SA462) exists. While your application is being processed, you do not have to pay.",
        ],
        intro_md: `The question every family asks first is a money question. Not the philosophy of the reform, not the classification levels, not the streams. Just: how much is this actually going to cost.

That question deserves a straight answer, and the government's own pages do not quite give one. My Aged Care explains the rules. The Department of Health, Disability and Ageing publishes the percentages. Services Australia runs the assessment. None of them sits down and shows you what a full pensioner, a part pensioner and a self-funded retiree really pay each month for the same care plan.

This article does that. We work through the three service categories, the percentage bands that apply to each cohort, the [income and assets assessment](https://www.servicesaustralia.gov.au/sa456) that decides where you sit, the lifetime cap, and, most importantly, the ways you can legitimately lower what you pay. Every dollar figure on this page is the current post-20-March-2026 indexed number. If you're reading this after 20 September 2026, the caps and thresholds may have moved slightly. Check the "Where these numbers come from" section at the bottom before quoting anything to a provider.

If you'd rather run the numbers on your parent's real situation instead of a worked example, the [Wayly Contribution Estimator](/ai-tools/contribution-estimator) does exactly that. But it helps to understand the rules first.`,
        sections: [
            {
                heading: "The short answer, in plain English",
                body_md: `Under Support at Home, you contribute a percentage of the cost of some services, and nothing for others. What you contribute depends on two things: which category the service falls into, and where Services Australia has placed you on the income and assets scale.

There are three service categories.

**Clinical care.** Nursing, physiotherapy, occupational therapy, allied health, and care management. Everyone pays **0%**. The government covers the full cost, regardless of income or assets. From 1 October 2026, personal care moves into this category too.

**Independence services.** Personal care (until October 2026), transport, social support, allied health that isn't clinical. Full pensioners pay **5%**. Self-funded retirees pay **50%**. Part pensioners and Commonwealth Seniors Health Card (CSHC) holders sit somewhere between 5% and 50%, based on their income and assets assessment.

**Everyday living services.** Cleaning, gardening, meal preparation, home maintenance, shopping assistance. Full pensioners pay **17.5%**. Self-funded retirees pay **80%**. Part pensioners and CSHC holders sit between 17.5% and 80%, again based on the assessment.

A lifetime cap of **$137,917.01** applies to how much you can ever be asked to contribute across your time on Support at Home. Once you reach it, contributions stop for good. Grandfathered participants under the "no worse off" principle have a lower cap of **$86,185.23** and lower percentage bands to match.

Everything else on this page is an expansion of those five paragraphs.`,
            },
            {
                heading: "The income and assets assessment (SA456), and why you should do it",
                body_md: `The [SA456 form](https://www.servicesaustralia.gov.au/sa456) is how Services Australia works out what percentage band you sit in for independence and everyday living. It is separate from the assessment My Aged Care ran when your parent was placed on the program.

It looks at income (pensions, wages, deemed income from financial assets, super drawdowns) and assets (financial assets, investments, second properties). The **principal home is exempt** from the Support at Home asset test. That is an important point. The house does not count.

For couples, income and assets are pooled and split in half regardless of whose name the assets are in. That is why one member of a couple can be a full pensioner and the other, on paper, look like a part pensioner. Services Australia divides everything by two.

The assessment is technically voluntary. If you don't complete it, Services Australia records you as **"means not disclosed"** and charges you the **maximum** contribution rate: 50% for independence, 80% for everyday living. For most people who aren't self-funded retirees, that is significantly more than the assessed rate would be.

Completing SA456 takes about an hour if you have your paperwork to hand: recent Centrelink pension letters, bank statements, super statements, and property valuations for any non-principal-home property. The assessment is valid for **120 days** before your services start, then remains active while you are on the program (you must notify Services Australia within 28 days of any material change).

If your parent is a full pensioner and it's obvious from the pension itself that they qualify for the 5%/17.5% bands, Services Australia can often complete the assessment from data they already hold, without a new form. Ring 1800 227 475 and ask. If your parent is a DVA pension recipient, the Department of Veterans' Affairs handles the assessment; do not send the SA456 to Services Australia in that case.`,
            },
            {
                heading: "Worked Examples: What Each Cohort Actually Pays",
                body_md: `Percentages are abstract. Let's put real numbers on a real care plan. Assume $80/hour for domestic assistance (everyday living) and $95/hour for personal care (independence, until October 2026). Assume the participant uses 4 hours of cleaning and 3 hours of personal care per fortnight. Rates are worked at cost, before care management is deducted.

| Cohort | Fortnightly cost of services | Fortnightly out-of-pocket contribution | Annual contribution |
|---|---|---|---|
| Full pensioner | $600.50 | $84.28 | ≈ $2,191 |
| Part pensioner (mid-band) | $600.50 | $185.50 | ≈ $4,823 |
| Self-funded retiree | $600.50 | $398.75 | ≈ $10,368 |

Note two things. First, the difference between a full pensioner and a self-funded retiree on the same care plan is roughly **$8,000 a year**. That is why the assessment matters so much. Second, from 1 October 2026 personal care drops to 0% for everyone. The full pensioner example above falls to about $56 a fortnight from that date. The self-funded retiree drops from about $399 to $256.

These are illustrative numbers only. Your actual rates depend on your provider's published prices (which must sit within the Department of Health's [range](https://www.myagedcare.gov.au)), the care management deduction discussed below, and whether your quarterly budget covers the plan. The [Wayly Contribution Estimator](/ai-tools/contribution-estimator) will do this arithmetic for your parent's specific circumstances.`,
            },
            {
                heading: "The Lifetime Cap, and the 'No Worse Off' Principle",
                body_md: `Support at Home puts an outer limit on how much you can ever be asked to contribute. The **standard lifetime cap is $137,917.01** (as at 20 March 2026, indexed twice a year on 20 March and 20 September). It is a **combined cap** with the non-clinical care contribution that would apply if your parent later moved into residential aged care. Contributions from both settings count towards the same total. When you reach it, Services Australia writes to you and to your provider, and you contribute nothing further, ever.

The **"no worse off" principle** applies to participants who were on a Home Care Package (or approved for one) before 12 September 2024. For that cohort, two things are lower:

- The lifetime cap is **$86,185.23** rather than $137,917.01.
- The percentage bands are lower: 0% clinical, 0% independence, 0% everyday living for full pensioners; up to 25% for self-funded retirees on both independence and everyday living services.

If you think your parent may be grandfathered but the letter from Services Australia says "standard," check by ringing 1800 227 475 and asking specifically whether the "no worse off" principle has been applied. Providers sometimes cite the wrong grandfathered cap on their websites: the correct current figure is **$86,185.23**, not $84,571.66 (that was the previous indexation) and not $82,018.15 (older still). Do not accept those older figures.`,
            },
            {
                heading: "Care Management: The Mandatory 10%",
                body_md: `On top of the contributions above, Support at Home takes a **flat 10% of each quarterly budget** for care management. This is mandatory. You cannot opt out, even if you self-manage. The funding is pooled across the provider's clients, and the provider must deliver at least one care management activity per month (a check-in, a plan review, a phone call).

Care management sits with a named "care partner" at your provider. It is not billed as a separate line on your statement in the way an old Home Care Package's "package management fee" was. Instead, it comes off the top of the quarterly budget before your services are drawn against it. On a $16,682 quarterly budget (Level 5), that is $1,668 set aside for care management every quarter.

You do not pay a **percentage contribution** on care management. It comes out of the government funded portion of your budget, not your out-of-pocket contribution. But it does reduce the amount of the quarterly budget available for actual care hours, which is worth knowing when your statement seems short on services relative to the budget on paper.`,
            },
            {
                heading: "How to Lower What You Pay, Legitimately",
                body_md: `There are four things you can do that most families never realise are options.

**Complete the SA456 if you haven't.** If your parent is currently on the "means not disclosed" maximum rate, and their actual assets and income would put them in a lower band, completing the assessment is a permanent, one-off drop in the contribution. This is the single most common missed win.

**Check Commonwealth Seniors Health Card (CSHC) eligibility.** CSHC holders are treated more favourably than self-funded retirees in the contribution bands. If your parent isn't a pensioner but has moderate income (below the 2026 thresholds of $99,025 single / $158,440 couple), they may qualify. Apply through [Services Australia](https://www.servicesaustralia.gov.au). If approved, notify Services Australia so the contribution band is recalculated.

**Ask for a reassessment when income drops.** If your parent's income has dropped since the last assessment (retired since assessment, super drawdown reduced, pension reinstated), that alone can move them to a lower band. Contact Services Australia within 28 days of the material change; you can ask them to backdate the recalculation to the change date.

**Apply for financial hardship (SA462) if you genuinely can't afford the rate.** The [financial hardship supplement](https://www.myagedcare.gov.au) is designed for participants whose available fortnightly income is less than 15% of the basic single Age Pension (currently **$165.05 per fortnight**, indexed with the pension). If approved, the fee reduction supplement covers all or part of your contribution and is backdated to the application date. While the application is being processed, you do **not** need to pay contributions.

None of these is a loophole. They are how the system is designed to work when families actually engage with it. The problem is that no provider will proactively tell you about them because none of them makes the provider any money.`,
            },
            {
                heading: "One-Off Changes Coming in October 2026: Personal Care",
                body_md: `From **1 October 2026**, personal care (help with showering, dressing, grooming, continence, safe movement around the home) moves out of the Independence category and into Clinical Care. That means the contribution drops from a means-tested percentage to **0%** for everyone.

This is a real change in the amount you pay, especially for households with significant personal care hours. If you have been rationing personal care hours because of the contribution cost, the October change is a good moment to sit down with the care plan and ask whether the hours still match what your parent actually needs. Our [personal care policy article](/resources/articles/support-at-home-personal-care-free-october-2026) walks through the practical implications, including what to check on the November statement.

Nothing else about the classification or the quarterly budget changes on 1 October 2026. The only difference is what appears in the "your contribution" column against personal care lines.`,
            },
            {
                heading: "Where These Numbers Come From",
                body_md: `We source every dollar figure on this page from the authoritative issuing body, not from a repackaged provider blog. Here is the trail.

- **Standard lifetime cap ($137,917.01):** [My Aged Care · Changes to contributions while accessing Support at Home](https://www.myagedcare.gov.au) and [health.gov.au · Support at Home participant contributions](https://www.health.gov.au). Note: the health.gov.au page still displays the previous "$135,318.69 (current as of 1 November 2025)" in some places; the current, indexed figure is $137,917.01.
- **"No worse off" cap ($86,185.23):** [My Aged Care · Changes to contributions while accessing Support at Home](https://www.myagedcare.gov.au).
- **Contribution percentage bands (0% / 5% / 17.5% / 50% / 80%):** [Department of Health · Support at Home participant contributions fact sheet](https://www.health.gov.au). The "no worse off" cohort bands (0% and up to 25%) are from the same fact sheet.
- **Care management cap (10% of the quarterly budget):** [health.gov.au · Care management for Support at Home](https://www.health.gov.au).
- **Financial hardship threshold ($165.05 per fortnight):** [My Aged Care · Financial hardship assistance](https://www.myagedcare.gov.au).
- **SA456 form:** [Services Australia · SA456](https://www.servicesaustralia.gov.au/sa456).
- **SA462 hardship form:** [Services Australia · SA462](https://www.servicesaustralia.gov.au/sa462).

All figures on this page are current as at 20 March 2026 and are due to reindex on **20 September 2026**. If you are reading this after that date, cross-check the caps and hardship threshold with My Aged Care before quoting them to a provider.

For decisions about your specific financial situation, talk to Services Australia (1800 227 475) or a licensed financial adviser. Wayly is a plain-English translator, not a licensed adviser. Nothing here is personal financial advice.`,
            },
        ],
        faqs: [
            {
                q: "How much do I have to pay for Support at Home?",
                a: "That depends on which service and which cohort you sit in. Clinical care is 0% for everyone. Independence services are 5% for full pensioners, 50% for self-funded retirees, and somewhere between for part pensioners and Commonwealth Seniors Health Card holders (set by the income and assets assessment). Everyday living services are 17.5% / 80% at the extremes. Grandfathered ('no worse off') participants pay less. From 1 October 2026, personal care drops to 0% for everyone. There is also a lifetime cap of $137,917.01 (or $86,185.23 for grandfathered participants), after which you pay nothing more.",
            },
            {
                q: "Do full pensioners pay anything for Support at Home?",
                a: "Yes, but not much. Full pensioners contribute 5% for independence services and 17.5% for everyday living services. Clinical care is free. If you are grandfathered under the 'no worse off' principle, both those percentages drop to 0% and you pay nothing for services on Support at Home.",
            },
            {
                q: "What happens if I don't do the income and assets assessment?",
                a: "Services Australia records you as 'means not disclosed' and charges the maximum contribution rate: 50% for independence services, 80% for everyday living services. For most non-self-funded households this is significantly higher than the assessed rate would be. Completing the SA456 form is the single fastest way to lower your bill, and there is no downside to doing it.",
            },
            {
                q: "How can I lower my Support at Home contribution?",
                a: "Four options exist and most families don't know all of them. First, complete the SA456 income and assets assessment if you haven't, especially if you are currently on the 'means not disclosed' maximum rate. Second, check whether the person receiving care qualifies for the Commonwealth Seniors Health Card. Third, ask Services Australia for a reassessment if income has dropped since the last assessment. Fourth, apply for financial hardship assistance (SA462) if the contribution is genuinely unaffordable; while the application is being processed you don't need to pay.",
            },
            {
                q: "What is the Support at Home lifetime cap?",
                a: "It is the total amount of contributions you can be asked to pay across your time on Support at Home. Once you reach it, the government covers all further non-clinical costs. The standard cap is $137,917.01 as at 20 March 2026, indexed twice a year. Grandfathered participants under the 'no worse off' principle have a lower cap of $86,185.23. The cap is combined with the residential non-clinical care contribution, so contributions in either setting count towards the same total.",
            },
            {
                q: "Is the Support at Home assessment the same as the pension means test?",
                a: "No. The pension means test decides whether you get the Age Pension and at what rate. The Support at Home income and assets assessment (SA456) decides where you sit in the contribution bands for independence and everyday living services. They use similar data but produce different outcomes. Your Age Pension status will influence the assessment (full pensioners are automatically placed in the lowest bands) but Services Australia still needs the SA456 to record it.",
            },
        ],
        related: [
            "wayly-contribution-estimator-support-at-home-fees",
            "support-at-home-personal-care-free-october-2026",
            "support-at-home-statement",
        ],
    },
    {
        slug: "how-to-switch-support-at-home-provider",
        title: "How to Switch Your Support at Home Provider (Without Losing Your Unspent Funds)",
        excerpt: "A neutral, step-by-step guide to changing Support at Home providers in 2026. Your funding follows you, there are no exit fees, and no new assessment is needed. Here is exactly how the process works and how to avoid a gap in care.",
        published_at: "2026-07-25",
        updated_at: "2026-07-25",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Adult child helping their parent review a shortlist of aged care providers on a laptop",
        meta: {
            title: "How to switch Support at Home providers (without losing your funds)",
            description: "Yes, you can change providers at any time. Your budget and unspent funds follow you. No exit fees. Here is the step-by-step process, the referral code trick, and the 70-day rule.",
        },
        key_takeaways: [
            "You can change Support at Home providers at any time, for any reason. There are no exit fees under the Aged Care Act 2024.",
            "Your classification, quarterly budget and eligible unspent funds move with you. No new assessment is needed.",
            "You must reactivate the referral code through My Aged Care (1800 200 422 or your online account) before the new provider can start.",
            "Line up the new provider before you give notice to the current one. That is the only way to guarantee no gap in care.",
            "Government-held unspent funds are available to the new provider immediately. Provider-held unspent contributions are finalised within 70 days of the exit date.",
            "The best time to switch is at the start of a quarter, so the quarterly budget follows you cleanly and unspent funds aren't lost to the rollover cap.",
        ],
        intro_md: `If you're helping a parent through Support at Home, and something isn't working with their current provider, you already know it. The visits keep being missed. The invoices don't match the care plan. The care partner has changed three times in six months. The support workers rotate. Communication is a black hole.

The instinct is to hesitate. What if we lose our funding. What if there's a gap in care. What if we're stuck with them because we've been with them for years. What if the new provider is worse.

The good news is that switching is designed to be simple. Under the Aged Care Act 2024, funding attaches to the participant, not to the provider. Your classification, quarterly budget and eligible unspent funds move with you. There are no exit fees. You don't need a new assessment. Every provider blog will confirm this because it's how the law is written now.

The bad news is that most of the blogs you'll find explaining it are written by providers who want you to switch **to them**. This one isn't. Wayly doesn't take commissions from providers and has no marketplace. What follows is what the government's own pages say, what the timing traps really are, and what to do in what order so you actually get through it without a gap in care or a lost dollar of unspent funding.`,
        sections: [
            {
                heading: "Can I Actually Just Leave? Yes.",
                body_md: `Yes. You can change Support at Home providers at any time, for any reason. You do not need permission. You do not need to justify the decision to My Aged Care or to your current provider. You do not have to prove the current provider did something wrong.

Under the [Aged Care Act 2024](https://www.health.gov.au), providers have a continuity-of-care duty when a participant leaves. That includes releasing your care records and care notes to the new provider within 28 days, finalising your budget within the required window, and not charging an exit fee. If a current provider tells you there's an exit fee, it is not a Support at Home exit fee (which the Act prohibits); it can only be a separate contractual matter you should query in writing.

The one thing you cannot do is switch to a provider that is not registered under Support at Home. All Support at Home providers must be registered with the Aged Care Quality and Safety Commission. The [Find a Provider](https://www.myagedcare.gov.au) tool on My Aged Care lists everyone currently registered.`,
            },
            {
                heading: "What Follows You, and What You Must Re-Establish",
                body_md: `Not everything travels with you automatically. Some things do, some you need to actively re-request.

**What follows you automatically:**

- Your **classification level** (1 through 8). No new assessment is needed. If you were on Level 5 with the old provider, you start with the new provider on Level 5.
- Your **quarterly budget** for the current quarter and every quarter going forward.
- **Government-held unspent funds.** These sit with Services Australia, not the provider, and are available to the new provider immediately once the referral is activated.
- **Provider-held unspent contributions** (money you paid the old provider that they hadn't yet spent on services). These are finalised within 70 days of your exit date and either refunded to you or transferred to the new provider, depending on the arrangement.

**What you must re-request or re-establish:**

- **Care notes and service history.** The new provider will request these from the old provider under the 28-day continuity-of-care rule. You don't need to chase this yourself, but confirm with the new provider that they've received them within the first month.
- **AT-HM approvals** (Assistive Technology and Home Modifications). If an AT-HM item has been approved but not yet delivered, the approval itself is valid regardless of provider, but you may need to re-share the approval documentation with the new provider so they can arrange delivery.
- **Restorative Care Pathway or End-of-Life Pathway status.** If either applies to your parent, tell the new provider on day one and provide the documentation. These pathways are participant-attached, not provider-attached, but the new provider needs to know they exist.
- **Direct-debit arrangements** for the participant contribution. You will set these up fresh with the new provider.
- **Your service agreement.** A new one is signed with the new provider. Read it carefully, especially the sections on notice periods (yes, they can set their own for a future move), out-of-pocket rates, and how brokered services are handled.`,
            },
            {
                heading: "The Step-By-Step Process (In the Right Order)",
                body_md: `The order matters. If you give notice before you have a new provider lined up, you risk a gap in care. If you activate the referral code before you have a service agreement, the new provider can't start. Here is the sequence that actually works.

**1. Compare providers before you move.** Use the [Wayly Provider Price Checker](/ai-tools/provider-price-checker) or the [My Aged Care Find a Provider](https://www.myagedcare.gov.au) tool. Prices vary meaningfully for identical services (cleaning at $75/hour with one provider, $110/hour with another, for the same care plan). At the same lifetime cap and quarterly budget, that is real money.

**2. Contact your shortlisted new provider.** Ask for a quote for the same care plan, confirmed prices in writing, their notice-period requirements when a client leaves them (in case you ever need to switch again), and their earliest available start date.

**3. Reactivate the referral code.** Call [My Aged Care on 1800 200 422](tel:1800200422) or log into your My Aged Care online account and reactivate the "reactivating home care services code." This tells the system you're seeking a new provider. My Aged Care will issue the code to the new provider you nominate. Note: a CHSP referral code cannot be reactivated; only a home care code can. If your parent was on the Commonwealth Home Support Programme before Support at Home, ring 1800 200 422 to work out the pathway.

**4. Sign the new provider's service agreement.** Before you give notice to the current provider. This locks in the start date with the new provider so there is no gap.

**5. Give notice to the current provider.** In writing. Reference the exit date agreed with the new provider. Most current providers have a notice-period requirement in their service agreement (commonly 14 days, sometimes 4 weeks). If you need to move faster than the notice period, ask the current provider to waive it in writing; many will.

**6. Confirm the transfer.** Between the two exit and start dates, confirm with the new provider that they have received your care records, your AT-HM approvals (if any), and any restorative or end-of-life pathway status. Confirm with My Aged Care that the classification and quarterly budget have transferred.

**7. Check the first statement carefully.** The first statement from the new provider is the one most likely to contain teething errors. Line-check it against the care plan. If anything looks off, our [Statement Decoder](/ai-tools/statement-decoder) will spot common issues in about 60 seconds.`,
            },
            {
                heading: "The 70-Day Rule for Unspent Funds",
                body_md: `This is the piece that most families worry about, and it's the one most provider blogs are inconsistent on. Some say 60 days. Some say 70 days. Services Australia's guidance to providers uses **70 days as the outer limit**.

Here is how it actually works.

**Government-held unspent funds** (the part of your quarterly budget the government hadn't yet released to a provider) are held by Services Australia. They move to the new provider **immediately** once the referral code activation goes through. There is no 70-day window on this money.

**Provider-held unspent contributions** (money you paid the current provider that they hadn't yet spent on services) are what the 70-day rule applies to. Providers have up to 70 days from your exit date to process the return, submit their final claims for the quarter, and either refund you or transfer the balance to the new provider. In practice, most providers complete it faster; 70 days is the outer limit under the Aged Care Act 2024, not the target. If day 71 comes and you haven't seen the money, that's when you escalate.

If you don't see the return by day 70, first ring your former provider's finance team in writing (email is fine; you want a paper trail). If they don't respond within a week, escalate to the [Aged Care Quality and Safety Commission on 1800 951 822](tel:1800951822). Include your exit date, the amount you're expecting back, and every attempt you've made to contact the provider.`,
            },
            {
                heading: "Timing Tip: Switch at the Start of a Quarter",
                body_md: `Support at Home budgets are released quarterly, in July, October, January and April. You are allowed to switch at any point in a quarter, but the timing has a small financial consequence.

**Switching at the start of a quarter** means the full new quarterly budget follows you cleanly to the new provider, unspent funds are cleanly assigned to one provider or the other, and the quarterly rollover cap (**the greater of $1,000 or 10% of the quarterly budget**) is straightforward to calculate.

**Switching mid-quarter** means the current provider claims the services they delivered up to your exit date, and the new provider draws against the remaining quarterly budget from your start date onwards. This works fine, but there is one gotcha: any unspent funds above the rollover cap **do not carry forward** to the next quarter. If you exit mid-quarter with a large unspent balance because the current provider under-delivered, some of it may be lost to the cap.

**Practical rule:** if you can wait until the end of a quarter to switch, do. If you can't (because care quality has become urgent), don't. The rollover cap loss is usually smaller than the cost of another two months with a provider that isn't working.`,
            },
            {
                heading: "Avoiding a Gap in Care: Two Rules and a Checklist",
                body_md: `A gap in care is the single most common regret we hear from families who've switched. It's also the easiest thing to prevent, if you follow two rules.

**Rule 1: sign with the new provider before you give notice.** Not "provisionally agreed." Not "verbally agreed." A signed service agreement with a start date in it.

**Rule 2: overlap the exit and start dates by one day if the new provider allows.** Some do; some don't. Ask. A one-day overlap means the first visit from the new provider happens on the last day of your notice period with the old one, and there is genuinely no gap.

Before your exit date, run through this checklist:

- [ ] New provider service agreement signed and dated.
- [ ] Referral code reactivated with My Aged Care.
- [ ] Written notice given to current provider, with the agreed exit date.
- [ ] Current provider has acknowledged the notice in writing.
- [ ] New provider has confirmed they will request your care records under the 28-day rule.
- [ ] Any AT-HM approvals have been shared with the new provider.
- [ ] Restorative Care Pathway or End-of-Life Pathway status (if applicable) has been shared with the new provider.
- [ ] Direct debit for the participant contribution has been cancelled with the current provider and set up with the new one.
- [ ] First visit with the new provider is scheduled.
- [ ] Diary entry for day 70 to check that any provider-held unspent contributions have been finalised.

If more than one family member is involved in the switch (siblings, spouse, participant's own decisions), the [Wayly Family Coordinator](/app/family) gives you a shared thread and an audit log of who agreed to what and when. This isn't a nice-to-have; it's how you avoid the "I thought you'd told the new provider about the pension letter" argument that ruins a switch.`,
            },
            {
                heading: "One More Thing: Continuity of Care and the 'Four-Quarter Rule'",
                body_md: `If a Support at Home participant does **not enter a new service agreement within four consecutive quarters** since last receiving a service, ongoing funding can be withdrawn. This is designed to reclaim funding from people who effectively left the program, not to penalise anyone doing a straightforward switch.

In practice, it means: don't give notice to your current provider and then take six months to find a new one. If you're between providers for more than a month or two, ring My Aged Care and let them know you're actively looking. As long as the program knows you're still on it, the funding continues.

The four-quarter rule is one reason we recommend picking the new provider first, then giving notice second. It's also why we recommend making the switch a defined project with a start and an end date, not an open-ended search.`,
            },
            {
                heading: "Where These Facts Come From",
                body_md: `Every fact on this page comes from an authoritative government source or the Aged Care Act 2024 itself, not from a provider blog.

- **No exit fees:** [Aged Care Act 2024 · continuity-of-care duty](https://www.health.gov.au) and [health.gov.au · Changing Support at Home providers](https://www.health.gov.au).
- **Funding follows the participant; no new assessment needed:** [My Aged Care · Changing providers](https://www.myagedcare.gov.au).
- **28-day transfer of care records:** [health.gov.au · Provider guidance](https://www.health.gov.au).
- **70-day finalisation of unspent contributions:** Services Australia provider guidance (Aged Care Act 2024 secondary legislation).
- **Referral code reactivation via My Aged Care 1800 200 422:** [My Aged Care · How to change providers](https://www.myagedcare.gov.au).
- **Quarterly rollover cap (greater of $1,000 or 10%):** [My Aged Care · Managing your Support at Home budget](https://www.myagedcare.gov.au).
- **Four-quarter rule:** [health.gov.au · Continuity of care under Support at Home](https://www.health.gov.au).

If any of the above changes materially between now and the next indexation on 20 September 2026, we update this article on the same day. If you spot an error, email [support@wayly.com.au](mailto:support@wayly.com.au) and we will fix it.`,
            },
        ],
        faqs: [
            {
                q: "Will I lose my unspent funds if I change providers?",
                a: "No. Government-held unspent funds (from your quarterly budget) transfer to the new provider immediately. Provider-held unspent contributions (money you paid the current provider that they hadn't yet spent on services) are finalised within 70 days of your exit date and either refunded to you or transferred to the new provider. The only situation where unspent funds are lost is if you exit mid-quarter with a very large unspent balance and the amount above the rollover cap (greater of $1,000 or 10% of the quarterly budget) doesn't carry into the next quarter.",
            },
            {
                q: "Are there exit fees to leave a Support at Home provider?",
                a: "No. Under the Aged Care Act 2024, Support at Home providers are prohibited from charging an exit fee when a participant leaves their care. If a current provider claims there is an exit fee, ask them in writing for the specific clause in your service agreement they're relying on. If they can't produce one, escalate to the Aged Care Quality and Safety Commission on 1800 951 822.",
            },
            {
                q: "Do I need a new assessment to switch providers?",
                a: "No. Your classification, quarterly budget and eligible unspent funds all follow you to the new provider. The assessment is participant-attached, not provider-attached. The only paperwork you need to do is reactivate the referral code through My Aged Care and sign the new service agreement.",
            },
            {
                q: "How long does it take to transfer to a new provider?",
                a: "The transfer itself can happen in a few days once the referral code is reactivated and the new service agreement is signed. Care records must be transferred within 28 days. Provider-held unspent contributions are finalised within 70 days as the outer limit, but most providers complete this faster. In practice, families who follow the recommended sequence (sign with new provider first, then give notice) usually complete the whole switch in two to three weeks.",
            },
            {
                q: "Do I have to contact My Aged Care to switch?",
                a: "Yes, but only to reactivate the referral code. Call 1800 200 422 or log into your My Aged Care online account. My Aged Care then issues the code to your nominated new provider. You don't need permission from My Aged Care to switch, and you don't need to explain your reasons. The referral code is administrative, not approval.",
            },
            {
                q: "Can I keep my current support workers if I switch?",
                a: "Sometimes, but not automatically. Support workers are employed by the provider, not by you, so they don't come with you when you change providers. If a specific support worker has been especially valued, you can ask the new provider whether they'd hire that worker (in which case the worker would need to leave the current provider and be re-employed). Some workers do move between providers to follow long-standing clients, but it isn't something you can insist on.",
            },
        ],
        related: [
            "wayly-provider-price-checker-support-at-home-prices",
            "how-much-will-i-pay-for-support-at-home",
            "support-at-home-statement",
        ],
    },
    // -------------------------------------------------------------------------
    // Where-to-Start Series · Article 1, Support at Home vs Home Care Packages
    // Ships from CONTENT-1 v1. Target: ~1,900 words. Effective figures pulled
    // from INDEX-1 (see /app/frontend/src/data/index1.json).
    // -------------------------------------------------------------------------
    {
        slug: "support-at-home-vs-home-care-packages-what-changed",
        title: "Support at Home vs Home Care Packages: What Actually Changed",
        excerpt: "A plain-English rundown of what the Support at Home program keeps, what it drops, and what to watch out for if you or a parent transitioned from Home Care Packages in 2025.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "An older Australian couple sitting at a kitchen table reviewing paperwork about their new Support at Home care plan.",
        meta: {
            title: "Support at Home vs Home Care Packages: What Changed",
            description: "Support at Home replaced Home Care Packages on 1 July 2025. Here's what changed, what stayed the same, and how the No Worse Off principle protects existing participants.",
            keywords: [
                "support at home vs home care packages",
                "aged care reforms 2025",
                "no worse off principle",
                "care management fee cap",
                "quarterly budget aged care",
            ],
        },
        key_takeaways: [
            "Support at Home replaced Home Care Packages on 1 July 2025 for new participants; anyone on an HCP as at 12/09/2024 keeps their protections under the No Worse Off principle.",
            "Clinical care (nursing, physio, allied health) becomes fully government-funded from 01/10/2026 for every classification.",
            "Care management is now capped at 10% of the quarterly budget, down from often 20% or more under HCP.",
            "Budgets are released quarterly across eight classifications instead of the old four-level HCP annual budget.",
            "Exit fees are prohibited under the Aged Care Act 2024, the old HCP exit-fee model is gone.",
        ],
        intro_md: `On 1 July 2025 the Australian government replaced the Home Care Packages (HCP) program with a new one called Support at Home. If you or a family member were already receiving HCP care on 12 September 2024, none of what follows should feel like a loss. Everyone on an active HCP as at that date is protected by the [No Worse Off principle](https://www.health.gov.au/support-at-home), which guarantees your out-of-pocket cost will not go up because of the reform.

If you're new to the aged care system in 2026 (or looking after a parent who is), then Support at Home is what you'll enrol in. It looks and feels different from HCP in a few important ways, some of them a genuine improvement, some of them just more complicated.

This guide is the plain-English version. No policy jargon. No 40-page department PDFs. We'll cover what changed, what stayed the same, and what to actually watch out for as your first quarterly statement lands.`,
        sections: [
            {
                heading: "Why did the government replace Home Care Packages?",
                body_md: `The old HCP program had four annual funding levels: Level 1 (about $10,600) up to Level 4 (about $61,000). It worked, but three complaints kept coming up:

1. **Care management fees ate the budget.** Providers charged anywhere from 20% to 40% of the annual package on "care management" and "package administration". Families were livid when the actual hours of care landed less than half of what they thought they were paying for.
2. **Assessment lag.** People sat on the National Priority Queue for six to twelve months waiting for a package.
3. **One-size annual budget.** If a fall meant your parent suddenly needed daily personal care, you had to spend down the annual budget fast and hope it held. Levels didn't flex mid-year.

Support at Home was designed to address all three. It caps care management at a hard 10%, replaces annual budgeting with quarterly budgeting (so unspent funds carry into the next quarter with limits), and expands the classification system to eight bands so care intensity fits more closely to actual need.`,
            },
            {
                heading: "The single biggest win: care management is capped at 10%",
                body_md: `Under the Aged Care Act 2024, no provider can charge more than **10% of the quarterly budget** on care management, regardless of how they label it. Care management now covers everything the provider does to plan, coordinate and monitor your parent's care, no more separate "package administration" line, no more "co-ordination" surcharge, no more "financial reporting" fee.

If you're used to reading HCP statements, this is the change you'll feel first. A Classification 4 participant with a quarterly budget of $7,424 should see no more than $742 of care management charged that quarter. If your provider's statement shows $1,100, that's Tier 3, worth raising with your provider in writing before you pay. Wayly's [Statement Decoder](/ai-tools/statement-decoder) and [Invoice Checker](/ai-tools/invoice-checker) both flag this automatically, but even without a tool, it's a five-minute mental check every month.`,
            },
            {
                heading: "The three streams: clinical, independence, everyday living",
                body_md: `HCP treated all care as one bucket. Support at Home splits every service into one of three streams, and each stream has a different contribution rule:

| Stream | What it covers | What you contribute |
|---|---|---|
| Clinical care | Nursing, physiotherapy, occupational therapy, dietetics, podiatry | **$0**, fully government-funded from 01/10/2026 |
| Independence | Personal care, respite in home, social support | 5%,50% depending on pension status |
| Everyday living | Domestic assistance, meals, gardening, home maintenance, transport | 17.5%,80% depending on pension status |

The contribution rate for the last two streams follows a sliding scale set by Services Australia and depends on the participant's income and assets. A full pensioner pays the floor rate (5% independence, 17.5% everyday living). A self-funded retiree pays the ceiling (50%, 80%). Part-pensioners land somewhere in between, and the rate is worked out from the Services Australia assessment letter, which the participant should have received with their Support at Home entry pack.

The stream split is one of the most confusing parts of the reform. Wayly's [Contribution Estimator](/ai-tools/contribution-estimator) walks through it with your parent's actual numbers if you'd like a shortcut.`,
            },
            {
                heading: "Quarterly budgets and the greater-of $1,000 or 10% carryover",
                body_md: `Instead of one big annual budget, Support at Home releases funding in four quarterly tranches, July, October, January, April. Unused funds roll into the next quarter, but there's a cap: **the greater of $1,000 or 10% of that quarter's budget**. Anything above the greater-of amount is forfeited at quarter end.

For a Classification 4 quarterly budget of $7,424, the rollover cap is about $742. If your parent racks up $2,000 of unspent funds in Q1 because of a hospital stay, roughly $1,258 of that will be forfeited when Q2 starts. This is a real change from HCP, where unspent Home Care Package balances could grow indefinitely (and, in fact, sat as a $1.4 billion national float when the reform was designed).

The practical takeaway: if you see a big unspent balance mid-quarter, use it. Book that overdue home modification, extra hours of respite, or the podiatrist visit that has been delayed. This is exactly why Wayly built the [Quarterly Pacing dashboard](/ai-tools/quarterly-pacing), so families see the balance before it forfeits, not after.`,
            },
            {
                heading: "What the No Worse Off principle actually protects",
                body_md: `If your parent was receiving Home Care Package care as at **12/09/2024**, the day the government locked in the transition, they carry an entitlement into Support at Home: their participant contribution can never be higher than it would have been under HCP rules, for the rest of their life on the program.

Some quick clarifications on this, because misinformation about the principle is everywhere:

- It applies to **participant contribution only**, not to the classification band. If a reassessment increases their band, the funding rises but the contribution rule is still capped at the HCP equivalent.
- It applies for **the rest of the participant's life** on the program, not just the first year.
- It does **not** transfer to a spouse or family member. It's participant-attached.
- It does **not** apply to anyone who signed up for aged care for the first time from 01/07/2025 onward.

If you think No Worse Off applies to your parent and you're not seeing it reflected on the statement, the provider must show working. Ask them in writing for the HCP-equivalent calculation for the quarter in question. Under the Aged Care Rules 2025 they're required to be able to produce it.`,
            },
            {
                heading: "Exit fees, refunds and the ACQSC's new power",
                body_md: `Under HCP some providers charged an "exit fee" of anywhere from $250 to $1,500 when a participant switched. Those are now **prohibited** under the Aged Care Act 2024. If you see an exit-fee line on a Support at Home invoice, that's a Tier 4 escalation, worth raising with the provider first, and if unresolved, reporting to the Aged Care Quality and Safety Commission on 1800 951 822.

From 01/05/2026 the ACQSC also has the power to order providers to refund overcharged money directly to participants. This is new and worth knowing about, because it changes the risk calculation for providers. The safer your paper trail (statements, invoices, service agreements), the stronger any refund claim.

Wayly's [Letters & Follow-ups](/ai-tools/letters-and-follow-ups) tool drafts the exact letter you'd send to a provider or to the ACQSC if you find a fee that looks non-compliant. It's not legal advice, but it saves you the "where do I start" moment.`,
            },
            {
                heading: "What actually stayed the same",
                body_md: `Even with all this, a lot of the day-to-day experience is unchanged:

- **My Aged Care remains the front door.** All assessments still start at 1800 200 422 or via [myagedcare.gov.au](https://www.myagedcare.gov.au/support-at-home).
- **Providers are still the ones delivering care.** You still choose the provider and can still switch (no new assessment needed, the classification follows the participant).
- **Care plans are still central.** The individualised care plan negotiated with the provider still governs what services get delivered week to week.
- **Advocacy is still free.** The Older Persons Advocacy Network (OPAN) still runs a free national advocacy line on 1800 700 600 for anyone dealing with a provider dispute.

If you'd like to know exactly what you might pay under the new streams, our [Contribution Estimator](/ai-tools/contribution-estimator) runs the numbers with your actual pension status and classification in about a minute.`,
            },
        ],
        faqs: [
            {
                q: "Do I need to reapply for aged care if I'm already on a Home Care Package?",
                a: "No. Anyone who was on an active HCP as at 12/09/2024 was transitioned automatically to Support at Home from 01/07/2025 with the No Worse Off protections in place. You don't need to reapply. If you'd like to check your classification, log in at myagedcare.gov.au or call 1800 200 422.",
            },
            {
                q: "Will my parent pay more under Support at Home than under HCP?",
                a: "Not if they were on HCP as at 12/09/2024, the No Worse Off principle guarantees the same or lower participant contribution for the rest of their life on the program. For new participants from 01/07/2025 onwards, the answer depends on pension status and which streams they use. Full pensioners typically pay less because of the low floor rates; self-funded retirees can pay more on the Everyday Living stream. Wayly's Contribution Estimator gives an exact figure in a minute.",
            },
            {
                q: "What happens to the money I had left over in my Home Care Package?",
                a: "It transfers with you. Any unspent HCP funds sit in a separate pool inside your Support at Home account and are not subject to the greater-of-$1,000-or-10% quarterly forfeit rule. They can be used on eligible Support at Home services in any quarter until they're spent.",
            },
            {
                q: "Are the quarterly budgets released automatically?",
                a: "Yes, the government releases each quarter's budget on the first day of that quarter (01/07, 01/10, 01/01, 01/04). You don't apply for it. The provider draws down on it as they deliver services, and your monthly statement shows the running balance.",
            },
            {
                q: "Can I still switch providers if I don't like mine?",
                a: "Absolutely, and there's no exit fee. Sign a service agreement with the new provider, reactivate the referral code via My Aged Care, and give notice to your current provider. The classification and unspent funds follow you. Wayly has a full switching playbook if you want the step-by-step.",
            },
            {
                q: "Where does the 10% care management cap come from?",
                a: "It's set out in the Aged Care Rules 2025 as part of the fee reform. Care management, whether labelled 'care management', 'coordination', 'package administration' or anything else, is combined and capped at 10% of the quarterly budget. If you see more than 10% on your statement, ask the provider in writing to break it down before paying.",
            },
        ],
        related: [
            "wayly-statement-decoder-support-at-home-statement-explained",
            "support-at-home-statement",
            "how-much-will-i-pay-for-support-at-home",
        ],
    },
    // -------------------------------------------------------------------------
    // Where-to-Start Article 2, The Three Streams
    // -------------------------------------------------------------------------
    {
        slug: "three-streams-clinical-independence-everyday-living",
        title: "The Three Streams, Explained Without Jargon",
        excerpt: "Clinical, Independence, Everyday Living, what each stream covers, what your parent contributes, and why the split matters when statements land.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Three coloured columns on a whiteboard representing the Support at Home clinical, independence and everyday living streams.",
        meta: {
            title: "The Three Support at Home Streams, Explained",
            description: "Support at Home splits every service into three streams, Clinical, Independence, Everyday Living. Here's what each covers and what you'll actually contribute.",
            keywords: ["support at home streams", "clinical care aged care", "independence stream", "everyday living stream", "aged care contribution"],
        },
        key_takeaways: [
            "Every Support at Home service maps to one of three streams, Clinical, Independence, or Everyday Living.",
            "Clinical care becomes fully government-funded from 01/10/2026, the participant contribution is $0.",
            "Independence stream (personal care, respite, social support) has a 5% to 50% sliding contribution rate.",
            "Everyday Living (domestic help, meals, gardening, transport) has the highest range: 17.5% to 80%.",
            "Full pensioners pay the floor rate on every stream; self-funded retirees pay the ceiling.",
        ],
        intro_md: `The three-stream model is the single most misunderstood part of Support at Home. If you know how it works, statements make sense; if you don't, every invoice looks like a mystery. This guide walks through what each stream covers, what your parent's contribution rate is, and why it varies so much between full pensioners and self-funded retirees.`,
        sections: [
            {
                heading: "Why three streams, not one?",
                body_md: `Under Home Care Packages there was one bucket of money. Support at Home splits that bucket into three streams because different types of care have different social returns. Clinical care improves health outcomes for the whole system, so the government funds it fully. Independence and Everyday Living are more about lifestyle and quality of life, the participant contributes a share based on their means.

The streams also stop cross-subsidisation. Unused Independence dollars cannot pay for Clinical services. Unused Everyday Living dollars cannot pay for Independence. That's why your monthly statement shows three separate balances.`,
            },
            {
                heading: "Clinical care, the free stream",
                body_md: `Clinical care includes registered nursing, physiotherapy, occupational therapy, dietetics, podiatry, wound care and continence support. From 01/10/2026, participant contribution on this stream is **$0** for every classification level.

If your parent's monthly statement shows a personal contribution against a clinical line dated after that cutoff, that's a Tier 4 finding in the Wayly Invoice Checker, worth raising with the provider before you pay, and if unresolved, worth escalating to the Aged Care Quality and Safety Commission on 1800 951 822.`,
            },
            {
                heading: "Independence, the middle stream",
                body_md: `The Independence stream covers personal care (showering, dressing, help with meals), respite in the home, and social support. Contribution rates depend on the participant's pension status:

| Pension status | Independence contribution |
|---|---|
| Full pensioner | 5% |
| Part pensioner | 5%, 50% (sliding scale) |
| Self-funded retiree | 50% |

Services Australia sets the exact rate based on income and assets. The participant should have received an assessment letter with the exact percentage when they enrolled, Wayly's [Contribution Estimator](/ai-tools/contribution-estimator) plugs in those figures and shows the monthly cost.`,
            },
            {
                heading: "Everyday Living, the highest-contribution stream",
                body_md: `Everyday Living covers domestic assistance (cleaning, laundry), meal preparation and delivery, gardening, home maintenance and transport. Contribution rates are much higher:

| Pension status | Everyday Living contribution |
|---|---|
| Full pensioner | 17.5% |
| Part pensioner | 17.5%, 80% (sliding scale) |
| Self-funded retiree | 80% |

For a self-funded retiree, a $100 gardening service means $80 out of pocket. This is a real change from HCP and is where families see the biggest swing in their monthly costs.`,
            },
            {
                heading: "How to check the stream on your statement",
                body_md: `Every line item on a Support at Home statement must show which stream it belongs to. If it doesn't, the provider isn't compliant with the Aged Care Rules 2025 and you're within your rights to ask. Wayly's [Statement Decoder](/ai-tools/statement-decoder) automatically maps each line to its stream and flags any line that's missing a category.

Common misclassifications we see: personal care billed under Everyday Living (should be Independence), transport billed under Independence (should be Everyday Living). Both cause the wrong contribution rate to fire.`,
            },
        ],
        faqs: [
            { q: "How do I know which stream a service belongs to?", a: "The statement must show the stream for every line. If it's missing, ask your provider in writing, they're required to disclose it under the Aged Care Rules 2025." },
            { q: "Can unused funds move between streams?", a: "No. Each stream has a ring-fenced quarterly balance. Leftover Independence dollars can't pay for Clinical services or Everyday Living." },
            { q: "Does the No Worse Off principle change the stream contribution rates?", a: "Yes for anyone on HCP as at 12/09/2024, their contribution can't exceed the HCP equivalent, even if the stream rate says otherwise." },
            { q: "What if my parent's pension status changes mid-year?", a: "Services Australia sends an updated assessment letter; the provider recalculates the contribution from the effective date. Ask the provider to show working if you're not sure the change was applied." },
            { q: "Do all providers charge the same stream percentages?", a: "The percentages are set by the government, they don't vary by provider. What can vary is the hourly rate for the underlying service, which is why Wayly's Provider Price Checker matters." },
            { q: "Where can I see the current sliding-scale rates?", a: "Services Australia publishes them; they update at each indexation event. Wayly's INDEX-1 constants track them." },
        ],
        related: [
            "support-at-home-vs-home-care-packages-what-changed",
            "wayly-contribution-estimator-support-at-home-fees",
            "support-at-home-statement",
        ],
    },
    // -------------------------------------------------------------------------
    // Where-to-Start Article 3, The Lifetime Cap
    // -------------------------------------------------------------------------
    {
        slug: "lifetime-contribution-cap-most-families-do-not-worry",
        title: "The Lifetime Contribution Cap and Why Most Families Don't Need to Worry",
        excerpt: "The $137,917 lifetime cap on Support at Home contributions sounds scary. Here's what it actually covers, who reaches it, and why most families never do.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "A financial adviser and family caregiver reviewing a lifetime contribution cap projection at a kitchen table.",
        meta: {
            title: "Support at Home Lifetime Cap: What It Means for Families",
            description: "The $137,917 lifetime cap on Support at Home participant contributions, who it applies to, how it's tracked, and why most families never come close.",
            keywords: ["support at home lifetime cap", "aged care lifetime contribution", "137917 aged care", "no worse off cap"],
        },
        key_takeaways: [
            "The lifetime cap on Support at Home participant contributions is $137,917 (effective 2026).",
            "It applies to the sum of Independence and Everyday Living contributions across the participant's entire aged-care journey.",
            "Clinical care contributions ($0 from 01/10/2026) never count towards the cap.",
            "Once the cap is reached, the participant's contribution drops to $0 for the rest of their life on the program.",
            "Grandfathered HCP participants under the No Worse Off principle carry a lower cap ($84,571) that transferred with them.",
        ],
        intro_md: `When Support at Home launched, one figure spooked a lot of families: a $137,917 lifetime cap on participant contributions. Media coverage suggested this was what everyone would end up paying. In reality, most families never come close, and the cap acts as an insurance ceiling rather than a target. This guide explains what the cap covers, how it's tracked, and how to know when your parent is approaching it.`,
        sections: [
            {
                heading: "What does the lifetime cap actually cover?",
                body_md: `The cap of $137,917 covers the participant's own contribution across two streams: **Independence** and **Everyday Living**. Clinical care contributions don't count because they're $0 for everyone from 01/10/2026. Neither does any Home Care Package amount paid before the transition (that sits in a separate lifetime cap under HCP rules for grandfathered participants).

Once the running total hits $137,917, the participant's contribution drops to $0 for the rest of their life on the program. The government picks up 100% of every service after that.`,
            },
            {
                heading: "How is the cap actually tracked?",
                body_md: `The provider is required to include a "cap tracker" section on the monthly statement showing the cumulative participant contribution and the remaining headroom to the cap. Wayly's Statement Decoder pulls this figure and shows it on the dashboard alongside the quarterly budget so you always know where you stand.

The Aged Care Rules 2025 also require the provider to notify the participant in writing at least 30 days before the cap is reached, so families can plan for the change.`,
            },
            {
                heading: "Why most families never reach it",
                body_md: `Reaching the cap requires either very high service usage over a long period, or a self-funded retiree paying the ceiling rates on both Independence and Everyday Living for years. At an average full-pensioner contribution of about $2,000-$3,000 a year, hitting $137,917 would take 45+ years. The cap exists to protect against catastrophic care costs, not to describe a typical bill.

For most families, the more relevant figure is the quarterly budget cap of about $7,424 (Classification 4), that's what they hit each quarter, not the lifetime figure.`,
            },
            {
                heading: "Grandfathering and the No Worse Off cap",
                body_md: `Participants on Home Care Packages as at 12/09/2024 carry a lower lifetime cap under the No Worse Off principle: $84,571.66 in 2026 dollars. Their remaining HCP contribution counts towards this figure, not the new $137,917 one.

If you think your parent is grandfathered, the provider must be able to show which cap applies. Ask for it in writing, it's a compliance requirement under the Aged Care Rules 2025.`,
            },
            {
                heading: "What to do if you're approaching the cap",
                body_md: `The 30-day notice period is your prompt to plan. Wayly's Contribution Estimator can project the exact month the cap will be hit based on your parent's current service usage. Once hit, there's no contribution, the participant continues receiving services at $0 to them.

Some families ask whether the cap should influence care choices earlier (e.g. delay non-essential Everyday Living services to preserve headroom). That's a legitimate financial planning question and worth talking through with a financial adviser familiar with aged care.`,
            },
        ],
        faqs: [
            { q: "What happens after my parent hits the lifetime cap?", a: "Their contribution drops to $0 for the rest of their life on the program. The government funds 100% of every service from that point." },
            { q: "Does the lifetime cap indexate?", a: "Yes, the $137,917 figure is set for 2026 and increases annually at indexation (typically 01/07 each year). Wayly's INDEX-1 tracks the current figure." },
            { q: "Do HCP contributions count towards the Support at Home cap?", a: "No, HCP contributions before 01/07/2025 sit under the HCP lifetime cap for grandfathered participants (and don't apply to new-entry participants at all)." },
            { q: "What if my parent hasn't received the 30-day notice but is close to the cap?", a: "Ask the provider in writing for a cap-tracker statement. If they can't produce one, that's a Tier 3 compliance issue worth raising." },
            { q: "Can the cap be waived or reduced under financial hardship?", a: "The hardship provisions in the Aged Care Act 2024 can reduce or waive contributions for eligible participants, separate from the cap. Contact My Aged Care on 1800 200 422 to apply." },
            { q: "Does clinical care count towards the cap?", a: "No. Clinical care contributions are $0 from 01/10/2026, and even before that date they don't count towards the lifetime cap." },
        ],
        related: [
            "support-at-home-vs-home-care-packages-what-changed",
            "wayly-contribution-estimator-support-at-home-fees",
            "how-much-will-i-pay-for-support-at-home",
        ],
    },
    // -------------------------------------------------------------------------
    // Where-to-Start Article 4, Switching Providers
    // -------------------------------------------------------------------------
    {
        slug: "switching-support-at-home-provider-practical-playbook",
        title: "Switching Providers: The Practical Playbook",
        excerpt: "A step-by-step guide to changing Support at Home providers without losing your unspent funds, without paying an exit fee, and without a new assessment.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Older woman on a phone call with a new aged care provider, notes and pen on the table.",
        meta: {
            title: "How to Switch Support at Home Providers Step by Step",
            description: "A neutral, step-by-step guide to changing Support at Home providers, no exit fees, no new assessment, and no lost unspent funds if you follow the sequence.",
            keywords: ["switching support at home provider", "change aged care provider", "aged care exit fee", "unspent funds transfer"],
        },
        key_takeaways: [
            "You can switch providers at any time, no permission needed from My Aged Care, no reassessment required.",
            "Exit fees are prohibited under the Aged Care Act 2024. Any exit-fee line on an invoice is a Tier 4 escalation.",
            "Your classification and eligible unspent funds transfer to the new provider.",
            "Sign with the new provider FIRST, then give notice to the current one, this preserves care continuity.",
            "The whole switch typically completes in 2-3 weeks; care records must transfer within 28 days.",
        ],
        intro_md: `Switching providers used to be one of the scariest parts of Home Care Packages, the exit fees, the fund transfers, the paperwork. Support at Home simplified almost all of it. This playbook walks through the exact sequence to switch without losing funds, without waiting weeks in service limbo, and without paying an exit fee that shouldn't exist.`,
        sections: [
            {
                heading: "Before you switch, is it actually the right move?",
                body_md: `A few questions worth asking first: Is the issue with the provider fundamental (billing, staff, communication) or fixable (one particular care worker, one recurring service)? Have you raised the issue formally in writing? Providers must respond to written complaints within 28 days under the Aged Care Rules 2025.

If you decide switching is right, the Wayly [Provider Price Checker](/ai-tools/provider-price-checker) shows the current rates for other providers in your suburb.`,
            },
            {
                heading: "Step 1, Sign the new service agreement first",
                body_md: `Find and sign with the new provider BEFORE giving notice to the current one. This preserves care continuity: services keep running on the current provider until the switch date. You don't need to explain your reasons to either provider, the classification and unspent funds transfer regardless.`,
            },
            {
                heading: "Step 2, Reactivate the referral code",
                body_md: `Call My Aged Care on 1800 200 422 or log in to your online account and request the referral code be reactivated for the new provider. This tells the government which provider to send funding to from the switch date.`,
            },
            {
                heading: "Step 3, Give written notice to the current provider",
                body_md: `Most service agreements require 14-30 days written notice. Send it by email so you have a timestamped record. Include the switch date and ask them to confirm: (a) all outstanding statements will arrive within 30 days of exit, (b) any provider-held unspent contributions will be finalised within 70 days, (c) care records will be transferred to the new provider within 28 days.

The [Letters & Follow-ups](/ai-tools/letters-and-follow-ups) tool drafts this exact notice.`,
            },
            {
                heading: "Step 4, Confirm the fund transfer",
                body_md: `Government-held unspent funds (from your quarterly budget) transfer immediately to the new provider. Provider-held unspent contributions (money you paid the current provider but they hadn't spent yet on services) are finalised within 70 days, either refunded to you or transferred to the new provider.

Ask the new provider to confirm receipt of both types of funds on their first statement.`,
            },
            {
                heading: "What if the current provider claims an exit fee?",
                body_md: `Exit fees are prohibited under the Aged Care Act 2024. Ask the provider in writing to show the specific clause in your service agreement they're relying on. If they can't produce one (they won't be able to), escalate to the Aged Care Quality and Safety Commission on 1800 951 822. From 01/05/2026 the ACQSC can order refunds directly.`,
            },
        ],
        faqs: [
            { q: "Will I lose my unspent funds if I switch?", a: "No. Government-held unspent funds transfer immediately. Provider-held unspent contributions are finalised within 70 days." },
            { q: "Do I need a new assessment?", a: "No. Classification and unspent funds follow the participant, not the provider." },
            { q: "Are there exit fees?", a: "No, prohibited under the Aged Care Act 2024. If a provider charges one, escalate to the ACQSC on 1800 951 822." },
            { q: "How long does the switch take?", a: "Typically 2-3 weeks. Care records must transfer within 28 days; provider-held funds within 70 days." },
            { q: "Do I have to tell My Aged Care why I'm switching?", a: "No, the referral-code reactivation is administrative. You don't need to justify the switch." },
            { q: "Can I keep my current support worker?", a: "Sometimes, support workers are employed by the provider, so they don't transfer automatically. Ask the new provider if they'd hire them." },
        ],
        related: [
            "wayly-provider-price-checker-support-at-home-prices",
            "wayly-reassessment-letter-generator-support-at-home-reassessment",
            "sah-invoice-checker-verify-support-at-home-invoice-five-minutes",
        ],
    },
    // -------------------------------------------------------------------------
    // Where-to-Start Article 5, Statement Flags
    // -------------------------------------------------------------------------
    {
        slug: "support-at-home-statement-flags-what-to-question",
        title: "What Is Worth Flagging on a Statement and What Is Not",
        excerpt: "Not every unusual line on a Support at Home statement is a problem. This guide separates the genuine red flags from the harmless anomalies.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Older man and adult daughter marking up a printed Support at Home statement with a highlighter.",
        meta: {
            title: "Support at Home Statement Anomalies, What Actually Matters",
            description: "Not every unusual statement line is a problem. Here's what to flag with your provider and what to let go on your Support at Home monthly statement.",
            keywords: ["support at home statement anomaly", "aged care statement errors", "statement red flags", "flag aged care charge"],
        },
        key_takeaways: [
            "Care management above 10% of the quarterly budget is always worth raising.",
            "Exit fees, personal care contributions after 01/10/2026, and stream misclassifications are Tier 4, worth escalating.",
            "Statement delays of up to 30 days after month-end are normal; longer delays are worth chasing.",
            "Small hourly-rate variations (under $2) are usually harmless; larger gaps against the Provider Price Checker are worth checking.",
            "Rounding differences at the cent level are ignored by every regulator and not worth raising.",
        ],
        intro_md: `Your parent's monthly statement lands. Something looks off. The temptation is to email the provider immediately, but not every anomaly is worth the phone call. This guide walks through what genuinely matters, what's borderline, and what's usually a false alarm.`,
        sections: [
            {
                heading: "Definitely worth raising, the Tier 4 red flags",
                body_md: `These are worth raising with your provider in writing and, if unresolved, escalating to the Aged Care Quality and Safety Commission on 1800 951 822:

- **Exit fees or early termination fees.** Prohibited under the Aged Care Act 2024.
- **Personal care contributions dated after 01/10/2026.** Personal care becomes fully government-funded from that date.
- **Care management above 10% of the quarterly budget.** Hard cap under Aged Care Rules 2025.
- **AT-HM items charged without a supplier invoice reference.** Provider must be able to produce the supplier invoice on request.
- **Missing stream classifications.** Every line must show which of the three streams it belongs to.`,
            },
            {
                heading: "Worth a polite question, Tier 3 anomalies",
                body_md: `These are worth asking about but rarely a compliance issue:

- **Hourly rate variations of $5+ against the Provider Price Checker snapshot.** Could be a legitimate weekend/public-holiday loading or a mistake.
- **Service dates outside the billing period.** If the invoice covers October but shows a November service, ask.
- **Duplicate line items.** Two identical entries on the same day, could be shift split, could be an error.
- **Invoice missing from statement or vice versa.** Cross-reconciliation is a rule under Aged Care Rules 2025.

The Wayly Statement Decoder catches all four of these automatically.`,
            },
            {
                heading: "Usually harmless, Tier 1 and Tier 2 informational",
                body_md: `These often show up on statements but rarely need action:

- **Cent-level rounding variations.** Ignored by every regulator.
- **Small hourly variations (under $2) between two providers in the same suburb.** Normal market variation.
- **Statement delivery in the first 30 days after month-end.** The Aged Care Rules 2025 allow up to 30 days.
- **Small closing-balance carryover under $50.** Immaterial.`,
            },
            {
                heading: "How to raise a Tier 3 or Tier 4 finding",
                body_md: `Always in writing (email is fine). Include: the exact line item, the amount, the date, and the specific rule you think it breaches. Ask for a response within 21 days. Wayly's Letters & Follow-ups tool drafts these automatically and cites the relevant section of the Aged Care Rules 2025.

If the provider doesn't respond within 21 days, or responds inadequately, escalate to the ACQSC on 1800 951 822. From 01/05/2026 the ACQSC can order provider refunds directly.`,
            },
        ],
        faqs: [
            { q: "How long can a statement be delayed before I chase it?", a: "The Aged Care Rules 2025 allow up to 30 days after month-end. Anything longer is worth chasing." },
            { q: "Is a $50 rounding variation worth raising?", a: "Only if it's on care management (which has a hard cap). Rounding at cent level is ignored; small dollar-level variations rarely lead anywhere." },
            { q: "What's the fastest way to check every line?", a: "Wayly's Statement Decoder, upload the PDF and every anomaly is flagged with its tier level." },
            { q: "Do I need a solicitor to raise a Tier 4 finding?", a: "No, start with a written letter to the provider. Involve OPAN or a solicitor only if the amount is significant and unresolved after escalation." },
            { q: "How do I know if a rate is above the market?", a: "Check the Wayly Provider Price Checker for the current rate for that service in your suburb." },
            { q: "What if my provider ignores my query?", a: "You have grounds to escalate to the ACQSC after 21 days. Keep every timestamped email as evidence." },
        ],
        related: [
            "wayly-statement-decoder-support-at-home-statement-explained",
            "sah-invoice-checker-verify-support-at-home-invoice-five-minutes",
            "wayly-reassessment-letter-generator-support-at-home-reassessment",
        ],
    },
    // -------------------------------------------------------------------------
    // Where-to-Start Article 6, When to Reassess
    // -------------------------------------------------------------------------
    {
        slug: "when-to-request-support-at-home-reassessment",
        title: "When to Request a Reassessment and When Not To",
        excerpt: "Reassessment can move your parent up (or down) a classification. Here's when it's worth asking, when to hold off, and what the process actually looks like.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Adult daughter helping an older parent complete a My Aged Care reassessment questionnaire at home.",
        meta: {
            title: "Requesting a Support at Home Reassessment, When and How",
            description: "Reassessment can raise or lower your parent's classification. Here's the trigger events that make it worth asking, and when to hold off.",
            keywords: ["support at home reassessment", "my aged care reassessment", "aged care classification review", "raise aged care level"],
        },
        key_takeaways: [
            "Reassessment can move a participant UP or DOWN a classification, no guarantee it will increase funding.",
            "Trigger events worth reassessing for: new diagnosis, hospital discharge, fall, carer availability change, home environment change.",
            "Reassessment is free and typically takes 4-8 weeks from request to outcome.",
            "You can request through My Aged Care on 1800 200 422 or online via myagedcare.gov.au.",
            "Wayly's Letters & Follow-ups tool drafts the reassessment request letter automatically.",
        ],
        intro_md: `A reassessment is a formal reappraisal of your parent's care needs by My Aged Care. It can move them up a classification (more funding) or down (less funding). The decision to request one shouldn't be automatic, here's when it's worth asking and when it's better to hold off.`,
        sections: [
            {
                heading: "Trigger events that usually justify a reassessment",
                body_md: `Any of the following is worth reassessing for:

- **New medical diagnosis**, dementia, Parkinson's, stroke recovery, cancer, mental health condition.
- **Hospital discharge** with new functional needs that weren't there before.
- **A fall** causing loss of mobility or new equipment needs.
- **Carer availability change**, a spouse-carer becoming unwell or unavailable.
- **Home environment change**, moving from independent living to shared living, or vice versa.
- **Progressive decline**, a slow drop in function over 6+ months.

If none of these apply, the participant's classification probably still fits.`,
            },
            {
                heading: "When NOT to reassess",
                body_md: `Reassessment isn't magic, asking for one when nothing has materially changed can lead to a DOWNGRADE if the assessor's clinical judgement differs from the previous assessor's. Situations where holding off is usually smarter:

- The participant's care needs are stable and the current funding covers them.
- You're within 3 months of the last assessment and nothing has changed since.
- The frustration is with the PROVIDER, not the funding level, switch providers first.
- You want more services but the classification doesn't limit you (you have unspent quarterly funds).`,
            },
            {
                heading: "How to request the reassessment",
                body_md: `Call My Aged Care on 1800 200 422 or log in to myagedcare.gov.au. Include: the trigger event, the date it occurred, and what has changed in your parent's daily function.

Wayly's [Letters & Follow-ups](/ai-tools/letters-and-follow-ups) tool drafts this request letter automatically, citing the trigger event with clinical language that assessors recognise.`,
            },
            {
                heading: "What the assessment process looks like",
                body_md: `An Aged Care Assessment Team (ACAT) or Regional Assessment Service (RAS) will visit, usually in-person, sometimes by phone, to review the participant's needs. The assessment covers activities of daily living, cognitive function, mental health, and carer situation. Total time: 60-90 minutes.

Outcome typically arrives 4-8 weeks later. The new classification (if changed) takes effect from the outcome date, not the request date.`,
            },
            {
                heading: "What if the reassessment goes the wrong way?",
                body_md: `If the classification is downgraded and you disagree, you can request a formal review within 28 days of the outcome letter. Include any clinical evidence (specialist letters, GP notes) that supports the higher classification. The review is conducted by a different assessor.`,
            },
        ],
        faqs: [
            { q: "How long does reassessment take?", a: "4-8 weeks from request to outcome. Assessment visit is 60-90 minutes." },
            { q: "Is there a fee to reassess?", a: "No, reassessment through My Aged Care is free." },
            { q: "Can I reassess more than once a year?", a: "Yes if a new trigger event occurs. No practical limit but frivolous re-requests can be declined." },
            { q: "What if the reassessment downgrades my parent?", a: "You can request a formal review within 28 days of the outcome letter." },
            { q: "Does the classification change immediately?", a: "The new classification takes effect from the outcome date, usually 4-8 weeks after the request." },
            { q: "Do I need medical evidence to reassess?", a: "Helpful but not required. Specialist letters or GP notes strengthen the request." },
        ],
        related: [
            "wayly-classification-self-check-support-at-home-levels",
            "wayly-reassessment-letter-generator-support-at-home-reassessment",
            "support-at-home-vs-home-care-packages-what-changed",
        ],
    },
];
