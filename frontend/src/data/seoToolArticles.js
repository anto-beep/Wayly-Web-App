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
 * Eight SEO/AEO-optimised "AI Tool" articles (Feb 2026).
 *
 * Each article is consumed by the structured renderer in
 * `pages/resources/Articles.jsx`. Editorial constraints:
 *   - NO author byline, NO published date, NO hero image, NO "Reviewed by".
 *   - No em-dashes or en-dashes used as sentence breaks.
 *   - JSON-LD emitted as `@graph`: Article + FAQPage + BreadcrumbList
 *     (HowTo added automatically when `howto` is supplied).
 */
export const SEO_TOOL_ARTICLES = [
    {
        published_at: "2025-11-18",
        updated_at: "2025-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-statement-decoder-support-at-home-statement-explained",
        title: "Wayly Statement Decoder: How to Read Your Support at Home Statement and Spot Hidden Charges",
        excerpt: "The Wayly Statement Decoder reads your Support at Home statement, finds hidden charges and tells you the dollar impact. One free decode a month.",
        meta: {
            title: "Wayly Statement Decoder: Read Your Aged Care Statement",
            description: "The Wayly Statement Decoder reads your Support at Home statement, finds hidden charges and tells you the dollar impact. One free decode a month.",
        },
        key_takeaways: [
            "Under Support at Home, your provider must send a monthly statement showing funding available, services delivered, contributions and any unspent funds, by the last day of the following month.",
            "Statements are not bills. If a contribution is owed, it comes as a separate invoice.",
            "Common problems include duplicate charges, charges during a hospital stay, brokered service premiums and care management above the 10% cap.",
            "The Wayly Statement Decoder reads your statement and flags issues by severity, with a dollar figure attached to each one.",
            "Wayly gives you one free decode a month, so you can try it before you commit.",
        ],
        intro_md: `If you have ever opened a parent's Support at Home statement and felt your eyes glaze over, you are not alone. The monthly statement is meant to give you a clear picture of how the quarterly budget is being spent, but the reality is pages of line items, codes and dollar figures that are hard to check. The Wayly Statement Decoder was built to do that checking for you.`,
        sections: [
            {
                heading: "How does a Support at Home statement work?",
                body_md: `Support at Home replaced Home Care Packages on 1 November 2025. Funding now comes as a quarterly budget tied to one of eight classification levels, and your provider draws services against that budget. To keep you informed, providers must give you a monthly statement.

The Department of Health, Disability and Ageing sets out what each statement must include. That covers the funding available at the start and end of the month, a list of services delivered with the date, price, units and total cost, your contribution rate and amounts, any adjustments or refunds from earlier months, and the funds remaining at month end. Statements must also show committed funds for assistive technology and home modifications, and the expiry dates on that funding.

There is a deadline. A provider must give you the statement by the last day of the following month, so a June statement must arrive by 31 July. They must send it even if no services were delivered that month.`,
            },
            {
                heading: "Why are aged care statements so hard to check?",
                body_md: `The honest answer is that the detail that protects you is the same detail that makes the document hard to read. A single month might list dozens of visits across personal care, nursing, transport, domestic help and allied health, each with its own code and rate.

Several things can go wrong and slip past a quick glance. A visit might be charged twice. A service might appear during a week your parent was in hospital. A brokered service, where your provider sends in an outside worker, might carry a premium above the published rate. Care management might creep above the 10% cap on the quarterly budget. None of these jump out unless you are checking every line against the rules.

This matters more now that the 1 July 2026 price caps have been deferred. On 19 May 2026 the Minister for Aged Care and Seniors, Sam Rae, announced the caps would be put on hold with no new start date, so providers still set their own prices. The [Aged Care Quality and Safety Commission](https://www.agedcarequality.gov.au) gained the power to order refunds where a provider is found to be overcharging, but you generally have to spot the problem and raise it first.`,
            },
            {
                heading: "How Wayly's Statement Decoder does this for you",
                body_md: `The [Wayly Statement Decoder](/ai-tools/statement-decoder) takes the checking off your plate. You upload the statement as a PDF, a photo, a Word document or plain text, and Wayly reads it for you.

Behind the scenes the Wayly Statement Decoder runs a two pass process. The first pass pulls every line item off the statement and structures it. The second pass runs each line against a set of fifteen rules drawn from how Support at Home is meant to work.

Those rules look for duplicate charges, care management above the 10% cap, brokered rate premiums above published rates, worker substitutions without proper notice, services charged during a hospital stay, services in the wrong contribution stream, quarterly underspend at risk of being forfeited, assistive technology funding nearing expiry, lifetime cap milestones, previous period adjustments, care plan breaches, government price cap breaches, incomplete assistive technology records and arithmetic that does not add up.

Each issue comes back tagged HIGH, MEDIUM or INFORMATIONAL, with a dollar figure so you can see what is at stake. You get a clean list of line items and a clear list of what to query with the provider.`,
            },
            {
                heading: "A worked example: Dorothy's June 2026 statement",
                body_md: `Take Dorothy Anderson, 79, who lives at 12 Eastern Beach Road, Geelong. She is on Support at Home Level 4 with Bluebell Care Services, her care manager is Susan Tran, and her daughter Catherine Smith manages the day to day. Her participant ID is SAH-2025-VIC-004821.

Dorothy's June statement looked normal at a glance. The Wayly Statement Decoder found seven things worth attention.

Three were flagged HIGH. A transport charge, code TR-003 on 12 June, had been billed twice at $89, so $178 instead of 89. A personal care visit on 11 June, code PC-001, was delivered by a substitute worker with no notice given. A registered nurse visit on 17 June, code RN-001, was also a substitution, this time with less than 24 hours notice.

Four were flagged MEDIUM. Care management was $20 and 82 cents above the 10% cap for the quarter. A brokered podiatry visit carried a 7 dollar premium above the published rate. A garden maintenance charge was sitting in a stream that did not look right and needed a classification query. And $482 and 62 cents of the quarterly budget was at risk of being forfeited as underspend.

Two were informational. A previous period adjustment had been correctly applied, so no action needed. And $720 of assistive technology funding for grab rails was still committed and waiting to be used.

With that list in hand, Catherine had a short, specific conversation with Susan Tran rather than a vague worry. The duplicate transport charge and the unnotified substitution are the kind of items the provider can correct or explain quickly.`,
            },
            {
                heading: "What should you do if the Decoder flags something?",
                body_md: `Start with your provider. Most issues, like a duplicate charge or a stream that looks wrong, are best raised with your care manager first, and providers can correct genuine errors.

If you are not satisfied, you have backup. The [Older Persons Advocacy Network](https://opan.org.au) runs a free advocacy line on 1800 700 600. The Aged Care Quality and Safety Commission can investigate overcharging and now has the power to order refunds. [My Aged Care](https://www.myagedcare.gov.au) on 1800 200 422 can help with broader questions about your funding.`,
            },
            {
                heading: "Try the Wayly Statement Decoder",
                body_md: `You do not need to become an aged care expert to check a statement. Upload your parent's latest Support at Home statement to the [Wayly Statement Decoder](/ai-tools/statement-decoder) and get a clear, plain English list of anything worth a question. Your first decode each month is free.`,
            },
        ],
        howto: {
            name: "How to decode a Support at Home statement with Wayly",
            description: "Upload a Support at Home statement and get a plain English list of anomalies in under a minute.",
            steps: [
                { name: "Save the statement", text: "Save the monthly statement from your provider as a PDF, photo, Word document or plain text." },
                { name: "Open the Wayly Statement Decoder", text: "Visit the Wayly Statement Decoder at /ai-tools/statement-decoder." },
                { name: "Upload the file", text: "Drag the file into the upload box, or paste the statement text into the field." },
                { name: "Review the flagged items", text: "Wayly returns line items and a list of HIGH, MEDIUM and INFORMATIONAL flags with dollar impact." },
                { name: "Raise queries with your provider", text: "Use the flagged list to start a focused conversation with your care manager." },
            ],
        },
        faqs: [
            { q: "Is a Support at Home statement the same as a bill?", a: "No. The statement is a summary of funding and services. If you owe a contribution, that comes as a separate invoice. You do not pay anything just because a statement arrives." },
            { q: "How often should I get a statement?", a: "Monthly. Your provider must give you a statement for each calendar month by the last day of the following month, even if no services were delivered." },
            { q: "What file types can the Wayly Statement Decoder read?", a: "You can upload a PDF, a photo, a Word document or a plain text file. Wayly reads the statement and returns line items plus a list of flagged issues." },
            { q: "How much does the Wayly Statement Decoder cost?", a: "Wayly gives non logged in visitors and free plan users one free decode per month. That lets you try it on a real statement before deciding to do more." },
            { q: "What does a HIGH flag mean?", a: "It means the issue has a clear dollar impact or a clear breach of the rules, like a duplicate charge or a service billed during a hospital stay. These are the items to raise with your provider first." },
            { q: "Can the Decoder tell me if I am being overcharged on price?", a: "It compares against published rates and flags brokered premiums and other anomalies. Since the 1 July 2026 price caps were deferred, there is no fixed government ceiling to check against, so the Decoder focuses on premiums, duplicates and rule breaches." },
        ],
        related: [
            "support-at-home-statement",
            "wayly-budget-calculator-support-at-home-quarterly-budget",
            "wayly-care-plan-reviewer-support-at-home-care-plan",
            "support-at-home-costs-and-contributions",
        ],
    },
    {
        published_at: "2025-12-19",
        updated_at: "2025-12-19",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-budget-calculator-support-at-home-quarterly-budget",
        title: "Wayly Budget Calculator: How Your Support at Home Quarterly Budget Works",
        excerpt: "The Wayly Budget Calculator tracks your Support at Home quarterly budget, the 10% care management cap and your rollover so funds are not lost.",
        meta: {
            title: "Wayly Budget Calculator: Track Your Quarterly Budget",
            description: "The Wayly Budget Calculator tracks your Support at Home quarterly budget, the 10% care management cap and your rollover so funds are not lost.",
        },
        key_takeaways: [
            "Support at Home funding is paid as a quarterly budget tied to your classification level, with 10% set aside for care management.",
            "You can carry over up to $1,000 or 10% of the quarterly budget, whichever is greater, to the next quarter. Anything above that is lost.",
            "Services sit in three streams: Clinical Care, Independence and Everyday Living. The stream affects what you contribute.",
            "The Wayly Budget Calculator tracks spending by classification, monitors the care management cap and the rollover ceiling, and watches your lifetime cap balance.",
            "Knowing where you stand mid quarter is the difference between using your funding and forfeiting it.",
        ],
        intro_md: `The shift to quarterly budgets under Support at Home gave families more flexibility, but it also gave them more to keep track of. Spend too slowly and you can lose money you needed. Let care management run high and your service budget shrinks. The Wayly Budget Calculator keeps the numbers straight so you can plan with confidence.`,
        sections: [
            {
                heading: "How do Support at Home quarterly budgets work?",
                body_md: `When you are approved for ongoing Support at Home services you receive one of eight classifications. Each comes with an annual amount split into four quarterly budgets, and you get the full quarter's amount at the start of the quarter.

The eight ongoing levels, effective 1 November 2025, run from Level 1 at $10,731 a year up to Level 8 at $78,106 a year. People who moved across from a Home Care Package sit on one of four transitioned levels instead. The amounts are indexed each 1 July.

10% of each quarterly budget is deducted for care management, which covers planning, coordination and review by your provider. That leaves about 90% for the services in your care plan.`,
            },
            {
                heading: "What happens to unspent funds?",
                body_md: `This is where families lose money without realising. At the end of a quarter, unspent funds roll over, but only up to a ceiling. The amount that carries over is the higher of $1,000 or 10% of your quarterly budget. Anything above that does not carry across and is returned to the system.

There is one exception. If your parent moved from a Home Care Package and brought unspent funds with them, those older funds are kept separately and are not subject to the rollover ceiling.

The practical lesson is to watch your spend through the quarter, not at the end. If services have been light because a parent was in hospital or a carer was away, the underspend can build to a point where some of it will be forfeited.`,
            },
            {
                heading: "What are the three streams and why do they matter?",
                body_md: `Support at Home groups services into three streams. Clinical Care covers nursing and allied health and is fully funded by the government, so there is no contribution. Independence covers things like personal care and social support. Everyday Living covers domestic help, gardening and meals.

The stream decides your contribution. Clinical Care is always nil. Independence contributions run from 5% for a full pensioner up to 50% for a self funded retiree. Everyday Living runs from 17.5% up to 80%. From 1 October 2026 personal care moves into the Clinical Care category, so it becomes fully government funded.

Because the streams carry different contributions, where a service sits affects both your budget and your out of pocket cost. A service in the wrong stream can cost you more than it should.`,
            },
            {
                heading: "How Wayly's Budget Calculator does this for you",
                body_md: `The [Wayly Budget Calculator](/ai-tools/budget-calculator) turns all of that into a live picture. You enter the classification and the quarter, and Wayly tracks spending against the budget so you always know how much is left and how fast it is going.

The Wayly Budget Calculator splits spending across the three streams, so you can see Clinical Care, Independence and Everyday Living separately. It monitors the 10% care management cap and warns you if care management is running high. It tracks the rollover ceiling, so you get a heads up while there is still time to use funds rather than lose them. It keeps an eye on assistive technology commitments and your lifetime cap balance.

The point is to give you the numbers before the quarter ends, not after, when nothing can be done.`,
            },
            {
                heading: "A worked example: Dorothy on Level 4",
                body_md: `Dorothy Anderson is on Support at Home Level 4 with Bluebell Care Services. Level 4 is $29,696 and 40 cents a year, which works out to about $7,424 and 10 cents a quarter.

Of that quarterly figure, 10%, about $742, is set aside for care management, leaving roughly $6,680 for services. The Wayly Budget Calculator shows Dorothy's daughter Catherine how that is being spent across the three streams as the quarter progresses.

In Dorothy's June quarter, the Wayly Budget Calculator picked up that $482 and 62 cents was sitting unspent with the quarter running down. Because Level 4's rollover ceiling is the greater of $1,000 or 10% of the quarterly budget, which is about $742, the full $482 would actually roll over this time. But the alert still mattered, because a pattern of underspend can mean the care plan no longer matches Dorothy's needs, which is a prompt to review services or consider a reassessment.

The Calculator also showed care management nudging above the cap by $20 and 82 cents, which Catherine flagged with Susan Tran.`,
            },
            {
                heading: "How can families avoid losing funding?",
                body_md: `Check in mid quarter. The most common mistake is to look at the budget only when the statement arrives, by which time the quarter may be nearly over.

Match spending to needs, not to the calendar. The goal is not to spend for the sake of it, but to make sure approved services are actually being delivered and that you are not quietly building an underspend you will lose.

If the budget keeps falling short or keeps building up, that is a signal. A shortfall may mean it is time for a reassessment to a higher classification. A steady underspend may mean the care plan needs a refresh.`,
            },
            {
                heading: "Try the Wayly Budget Calculator",
                body_md: `Stop guessing where the quarter stands. Enter your parent's classification into the [Wayly Budget Calculator](/ai-tools/budget-calculator) and see your spending, your care management cap and your rollover at a glance, while there is still time to act.`,
            },
        ],
        howto: {
            name: "How to track your Support at Home quarterly budget with Wayly",
            description: "Enter your classification and current spending to see budget, care management cap and rollover risk in seconds.",
            steps: [
                { name: "Pick the classification", text: "Choose the Support at Home classification (1 to 8) or transitioned level for your parent." },
                { name: "Enter spending to date", text: "Enter spending across Clinical Care, Independence and Everyday Living for the quarter so far." },
                { name: "Read the result", text: "Wayly shows your care management against the 10% cap, your rollover ceiling and how much budget remains." },
                { name: "Act mid quarter", text: "Use the alerts to schedule extra services if underspending, or query care management if it is running high." },
            ],
        },
        faqs: [
            { q: "How much can I carry over to the next quarter?", a: "The higher of $1,000 or 10% of your quarterly budget. Anything above that is returned to the system and cannot be used later." },
            { q: "How much of my budget goes to care management?", a: "10% of each quarterly budget is set aside for care management. The Wayly Budget Calculator flags it if a provider charges above that cap." },
            { q: "What is the quarterly budget for Level 4?", a: "About $7,424 and 10 cents, based on the annual Level 4 amount of $29,696 and 40 cents effective 1 November 2025. Amounts are indexed each 1 July." },
            { q: "Do clinical services come out of my budget?", a: "Yes, they are paid from your budget, but you make no contribution towards them. Clinical Care is fully government funded." },
            { q: "Can the Wayly Budget Calculator track my lifetime cap?", a: "Yes. It keeps a running view of your lifetime contribution balance alongside your quarterly spending." },
        ],
        related: [
            "support-at-home-costs-and-contributions",
            "wayly-statement-decoder-support-at-home-statement-explained",
            "wayly-contribution-estimator-support-at-home-fees",
            "wayly-care-plan-reviewer-support-at-home-care-plan",
        ],
    },
    {
        published_at: "2026-01-19",
        updated_at: "2026-01-19",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-provider-price-checker-support-at-home-prices",
        title: "Wayly Provider Price Checker: Comparing Support at Home Prices After the Cap Deferral",
        excerpt: "With price caps deferred, the Wayly Provider Price Checker compares your provider's rates against published prices and the Wayly Quality Index.",
        meta: {
            title: "Wayly Provider Price Checker: Compare Aged Care Prices",
            description: "With price caps deferred, the Wayly Provider Price Checker compares your provider's rates against published prices and the Wayly Quality Index.",
        },
        key_takeaways: [
            "The Support at Home price caps that were due to start on 1 July 2026 were deferred on 19 May 2026, with no new start date set.",
            "Providers still set their own prices, so the same service can cost very different amounts depending on who delivers it.",
            "The Aged Care Quality and Safety Commission can now order refunds where a provider is found to be overcharging.",
            "The government has committed to publishing a quarterly National Summary of Support at Home Prices so families can compare. As at June 2026 it had not yet been published.",
            "The Wayly Provider Price Checker compares your provider's rates against published prices and the Wayly Provider Quality Index.",
        ],
        intro_md: `For most of the past year families were told that government price caps would arrive on 1 July 2026 and put a ceiling on what providers could charge. That changed in May 2026. With caps now on hold, the job of checking whether a provider's prices are fair has fallen back to families. The Wayly Provider Price Checker is built for exactly this situation.`,
        sections: [
            {
                heading: "What happened to the Support at Home price caps?",
                body_md: `The plan was clear on paper. From 1 July 2026, the government would set a maximum price for each Support at Home service, and providers could not charge above it. On 19 May 2026 the Minister for Aged Care and Seniors, Sam Rae, deferred that plan, saying the government would wait until it had "greater confidence in the stability of the market." No new start date has been set. In the Department of Health media release "Strengthening consumer protections for older Australians," Rae said, "Older Australians and their families told us they need stronger protections against rogue market prices. We've listened, and we're acting."

The reasoning given was that caps only work if they are set at the right level, and that setting them against an unstable, higher than usual pricing baseline could push prices up rather than down. Provider peak bodies welcomed the deferral. Ageing Australia chief executive Tom Symondson said the decision "reduces the immediate risk of widespread, last minute changes to service agreements," and Catholic Health Australia's aged care director Alex Lynch called it a "sensible decision," adding that "this was a solution without a problem." Consumer advocates were more cautious. The [Older Persons Advocacy Network](https://opan.org.au)'s policy director, Samantha Edmonds, warned that "delaying pricing caps means older people will continue to face uncertainty about what they will pay," while [COTA Australia](https://www.cota.org.au) chief executive Patricia Sparrow described the measures as "a welcome and necessary first step."

So as things stand, there is no government ceiling on Support at Home prices. Providers must set prices that are reasonable and reflect the cost of delivering care, and they must publish them, but reasonable is a judgement rather than a hard number.`,
            },
            {
                heading: "What protections replaced the caps?",
                body_md: `The government did not leave the gap empty. As part of the May 2026 package, the Aged Care Quality and Safety Commission gained the power to order refunds where a provider is found to be overcharging, and to take action against providers that fail to issue monthly statements.

The government also committed to publishing a quarterly National Summary of Support at Home Prices. As the Department of Health put it, the document "will show the median and the range of prices charged by providers," so families can see how their provider compares. As of June 2026 that quarterly National Summary had not yet been published, so the practical tools available to families right now are published provider price lists and independent comparison.

Providers are also being encouraged to limit price increases. The same Department release says the government will "encourage providers to limit the frequency of price increases to no more than two per year, giving older people certainty to budget their packages." This is encouragement rather than a rule.`,
            },
            {
                heading: "How do you compare aged care providers on price?",
                body_md: `Every Support at Home provider must publish its full price list on the [My Aged Care Find a Provider](https://www.myagedcare.gov.au/find-a-provider) tool and on its own website, and the published price must be the one most frequently charged. That gives you a starting point for a like for like comparison.

Price is not the only thing that matters. A cheap provider that cannot deliver reliably, or that leans heavily on brokered workers, may cost you more in practice. Brokering is where a provider sends in an outside worker for a service it does not deliver itself, and it can come with a premium on top of the published rate.

The trick is to compare price and quality together, and to keep an eye on whether the rates you are actually charged match the rates that were published and agreed.`,
            },
            {
                heading: "How Wayly's Provider Price Checker does this for you",
                body_md: `The [Wayly Provider Price Checker](/ai-tools/provider-price-checker) brings price and quality into one view. Because the 1 July 2026 caps were deferred, the Checker no longer measures prices against a government ceiling that does not exist. Instead it compares your provider's rates against published prices and, once it is available, the government's quarterly National Summary of Support at Home Prices.

The Wayly Provider Price Checker also weighs prices against the Wayly Provider Quality Index, so you are not just chasing the lowest hourly rate. It highlights brokered service premiums, where an outside worker is charged above the published rate, so you can see when a premium is creeping into your statements.

The result is a clearer answer to the question families actually ask, which is not just is this cheap, but is this fair and is this good value.`,
            },
            {
                heading: "A worked example: Robert and a brokered physio premium",
                body_md: `Robert Kowalski is 84, lives at 18 Jetty Street, Coffs Harbour, and is on Support at Home Level 6 with Sunrise Community Care. His care manager is Anika Brennan and his wife Margaret is his main contact. His participant ID is SAH-2025-NSW-009147.

Robert's May statement included a brokered physiotherapy service. The Wayly Provider Price Checker flagged a premium of $16 an hour over two hours, so $32 above the published physio rate. Because physiotherapy is clinical care, Robert pays no contribution towards it, but the premium still draws down his budget faster than the published rate would.

The Checker also showed how Sunrise Community Care's rates sat against published prices for the Coffs Harbour area and against the Wayly Provider Quality Index. That gave Margaret a grounded way to decide whether to query the brokered premium with Anika Brennan, or whether the convenience of the brokered physio was worth it. Either way, the decision was informed rather than a guess.`,
            },
            {
                heading: "Try the Wayly Provider Price Checker",
                body_md: `With caps on hold, value is something you have to check for yourself. Run your provider through the [Wayly Provider Price Checker](/ai-tools/provider-price-checker) to see how their rates compare and whether any premiums are quietly adding up.`,
            },
        ],
        faqs: [
            { q: "Are there price caps on Support at Home services?", a: "Not currently. The caps that were due to start on 1 July 2026 were deferred on 19 May 2026, with no new start date. Providers set their own prices, which must be reasonable and published." },
            { q: "How can I tell if my provider is charging too much?", a: "Compare their published prices against other local providers and, once it is published, the government's quarterly National Summary of Support at Home Prices. The Wayly Provider Price Checker does this comparison for you and adds the Wayly Provider Quality Index." },
            { q: "What can I do if I think I have been overcharged?", a: "Raise it with your provider first. If that does not resolve it, the Aged Care Quality and Safety Commission can investigate overcharging and now has the power to order refunds. The OPAN advocacy line on 1800 700 600 can help you make your case." },
            { q: "What is a brokered service premium?", a: "It is an extra amount charged when your provider sends in an outside worker for a service it does not deliver itself. The Wayly Provider Price Checker flags these premiums against the published rate." },
            { q: "Where are provider prices published?", a: "On the My Aged Care Find a Provider tool and on each provider's own website. The published price must be the price the provider most frequently charges." },
        ],
        related: [
            "home-care-package-vs-support-at-home",
            "wayly-statement-decoder-support-at-home-statement-explained",
            "wayly-contribution-estimator-support-at-home-fees",
            "support-at-home-costs-and-contributions",
        ],
    },
    {
        published_at: "2026-02-19",
        updated_at: "2026-02-19",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-classification-self-check-support-at-home-levels",
        title: "Wayly Classification Self-Check: Are You on the Right Support at Home Level?",
        excerpt: "The Wayly Classification Self-Check screens your parent's needs against assessment criteria and flags if a higher Support at Home level is warranted.",
        meta: {
            title: "Wayly Classification Self-Check: Right Support at Home Level?",
            description: "The Wayly Classification Self-Check screens your parent's needs against assessment criteria and flags if a higher Support at Home level is warranted.",
        },
        key_takeaways: [
            "Support at Home has eight ongoing classifications, with annual funding from $10,731 at Level 1 to $78,106 at Level 8, effective 1 November 2025.",
            "Classifications are set through the Single Assessment System, which replaced ACAT and RAS on 9 December 2024 and uses the Integrated Assessment Tool.",
            "A classification does not change on its own. If needs increase, you have to request a review.",
            "The Wayly Classification Self-Check runs a seven question screen against the assessment criteria and flags possible under classification.",
            "It is a guide to whether a reassessment is worth requesting, not a replacement for the official assessment.",
        ],
        intro_md: `A Support at Home classification decides how much funding your parent gets, so being on the wrong level has real consequences. Needs change, especially after a fall or a hospital stay, but the classification does not update itself. The Wayly Classification Self-Check helps you work out whether it might be time to ask for a higher level.`,
        sections: [
            {
                heading: "How do Support at Home classifications work?",
                body_md: `When your parent is assessed as eligible for ongoing Support at Home services, they are placed in one of eight classifications. Each carries a set annual budget, paid quarterly. Level 1 sits at $10,731 a year and Level 8 at $78,106 a year, with the levels in between rising steadily. People who transitioned from a Home Care Package sit on one of four transitioned levels that mirror their old package funding.

The classification reflects overall need, not a fixed number of hours. How far the funding goes depends on the services chosen and what they cost. The move from four Home Care Package levels to eight classifications was meant to match funding more closely to need and reduce the gaps where someone fell between levels.`,
            },
            {
                heading: "Who decides your classification?",
                body_md: `Classifications are decided through the Single Assessment System. This replaced the old ACAT and RAS arrangements on 9 December 2024, bringing the different assessment workforces together into one. Assessors use the Integrated Assessment Tool, which has been in use since 1 July 2024 and looks at daily tasks, health, mobility, cognition, safety and goals.

You start through [My Aged Care](https://www.myagedcare.gov.au) on 1800 200 422. A triage call usually happens within about two weeks, and an assessor then meets your parent at home or in hospital. After the assessment you receive an outcome letter, often called a Notice of Decision, with the classification and a support plan.`,
            },
            {
                heading: "Why might a parent be under classified?",
                body_md: `The most common reason is that needs have grown since the last assessment. A classification set when a parent was mostly independent does not reflect a parent who has since had a fall, lost mobility or started needing daily help.

The signs are practical. Services keep running short before the quarter ends. A parent is relying more on family than they used to. Tasks that were manageable are now difficult. Carer stress is building. Any of these can mean the funding no longer matches the need, and that a higher classification may be warranted.

The system does not catch this for you. Unless you request a review, the classification stays where it is.`,
            },
            {
                heading: "How Wayly's Classification Self-Check does this for you",
                body_md: `The [Wayly Classification Self-Check](/ai-tools/classification-self-check) gives you a structured way to test your hunch. It asks seven questions that line up with the kinds of things the Integrated Assessment Tool looks at, covering daily living, mobility, health, cognition and the support already in place.

Based on your answers, the Wayly Classification Self-Check flags whether the current level looks like a reasonable match or whether the needs you have described point to a higher classification. It then suggests the next steps, which usually means requesting a support plan review through My Aged Care.

The Wayly Classification Self-Check is a guide, not the official assessment. Only an assessor can change a classification. What the Self-Check does is help you decide whether it is worth starting that conversation, and give you a clearer sense of what to raise.`,
            },
            {
                heading: "A worked example: Patricia after a fall",
                body_md: `Patricia Holloway is 81 and lives at 7 Wharf Street, Hervey Bay. She is on Support at Home Level 3 with Coastal Aged Care Services, her care manager is Robyn Walsh, and her son Daniel manages much of her care. Her participant ID is SAH-2025-QLD-003312.

Patricia had a fall in March 2026 and her mobility has been declining since. Daniel had a feeling that Level 3, at $21,965 and 70 cents a year, was no longer enough, but he was not sure if that feeling was justified.

He ran the Wayly Classification Self-Check. The seven questions drew out that Patricia now needs help with personal care most days, that her falls risk has increased, and that her care plan services keep running short before the quarter ends. The Self-Check flagged possible under classification and suggested that a move from Level 3 to Level 4, which is $29,696 and 40 cents a year, looked worth pursuing.

That gave Daniel the confidence to request a support plan review, and a clear picture of the changes to describe when the assessor called. He did not have to argue from a vague worry. He had specifics.`,
            },
            {
                heading: "Try the Wayly Classification Self-Check",
                body_md: `If you have a nagging feeling your parent's level no longer fits, test it. The [Wayly Classification Self-Check](/ai-tools/classification-self-check) takes a few minutes and tells you whether a reassessment is worth requesting. If the result points to a review, the [Wayly Letters & Follow-ups](/ai-tools/letters-and-follow-ups) writes the request for you.`,
            },
        ],
        howto: {
            name: "How to check your Support at Home classification with Wayly",
            description: "Answer seven questions to see whether your parent's current Support at Home level still matches their needs.",
            steps: [
                { name: "Open the Self-Check", text: "Visit the Wayly Classification Self-Check at /ai-tools/classification-self-check." },
                { name: "Answer the seven questions", text: "Each question is short and reflects what an assessor would ask about daily living, mobility, health and cognition." },
                { name: "Read the result", text: "Wayly tells you whether your parent looks well placed, or whether a higher level may be warranted." },
                { name: "Decide your next step", text: "If the result points to a review, request one through My Aged Care or use the Wayly Letters & Follow-ups." },
            ],
        },
        faqs: [
            { q: "How many Support at Home levels are there?", a: "Eight ongoing classifications, from Level 1 to Level 8, plus four transitioned levels for people who moved across from a Home Care Package." },
            { q: "Who decides my Support at Home classification?", a: "An assessor through the Single Assessment System, using the Integrated Assessment Tool. You start the process through My Aged Care on 1800 200 422." },
            { q: "Can the Wayly Classification Self-Check change my level?", a: "No. Only an official assessment can change a classification. The Self-Check helps you decide whether to request a review and what to raise." },
            { q: "What is the difference between Level 3 and Level 4?", a: "Funding. Level 3 is $21,965 and 70 cents a year and Level 4 is $29,696 and 40 cents a year, effective 1 November 2025. A higher level means a larger budget for more or more intensive services." },
            { q: "How do I ask for a higher classification?", a: "Request a support plan review through My Aged Care, or ask your provider to help. If your needs have increased significantly, the assessor can refer you for a higher classification." },
        ],
        related: [
            "wayly-reassessment-letter-generator-support-at-home-reassessment",
            "wayly-care-plan-reviewer-support-at-home-care-plan",
            "support-at-home-costs-and-contributions",
            "wayly-budget-calculator-support-at-home-quarterly-budget",
        ],
    },
    {
        published_at: "2026-03-22",
        updated_at: "2026-03-22",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-reassessment-letter-generator-support-at-home-reassessment",
        title: "Wayly Letters & Follow-ups: How to Request a Support at Home Reassessment",
        excerpt: "The Wayly Letters & Follow-ups writes a clear letter to My Aged Care requesting a Support at Home reassessment. Editable and saved to your vault.",
        meta: {
            title: "Wayly Letters & Follow-ups: Request a Review",
            description: "The Wayly Letters & Follow-ups writes a clear letter to My Aged Care requesting a Support at Home reassessment. Editable and saved to your vault.",
        },
        key_takeaways: [
            "If your parent's needs have increased, you can request a reassessment or support plan review at any time through My Aged Care on 1800 200 422.",
            "A support plan review is the usual first step to move up a classification level.",
            "A strong request describes what has changed in concrete terms: a fall, a hospital stay, declining mobility, growing carer strain.",
            "The Wayly Letters & Follow-ups produces a formatted letter to My Aged Care, which you can edit and which is saved to your Wayly vault.",
            "Requesting a review does not put your existing funding or fee protections at risk.",
        ],
        intro_md: `Once you suspect your parent is on too low a Support at Home level, the next hurdle is getting the request right. A vague phone call can sit in a queue. A clear, specific request that spells out what has changed is far more likely to move. The Wayly Letters & Follow-ups helps you write that request.`,
        sections: [
            {
                heading: "When should you request a reassessment?",
                body_md: `A Support at Home classification reflects need at the time of assessment, but need changes. You can ask for a review at any time, and there are clear triggers worth acting on.

A fall, a new diagnosis or a hospital stay are obvious ones. So is a steady decline in mobility, or finding that daily tasks have become difficult. Funding that keeps running short before the quarter ends is a financial sign that the level no longer fits. Carer strain matters too, and assessors take it seriously, because a carer reaching their limit puts the whole arrangement at risk.

You do not have to wait for an annual review. If something has changed, you can act now.`,
            },
            {
                heading: "What is the difference between a support plan review and a reassessment?",
                body_md: `These two terms cause a lot of confusion. A support plan review is a check of whether your current plan still meets your needs. It is usually quicker and simpler than a full reassessment, and it is the formal trigger to move up a classification if your needs have increased.

If the review finds that needs have grown significantly, the assessor can refer your parent for a higher classification. A full reassessment looks more broadly. In practice, for a family that thinks a parent should move from one level to the next, the support plan review is the starting point.

Importantly, asking for a review does not reduce your existing funding, and it does not remove the no worse off fee protections that apply to people who transitioned from a Home Care Package.`,
            },
            {
                heading: "How do you make the request count?",
                body_md: `The difference between a request that moves and one that stalls is detail. Assessors and triage staff deal with high volumes, so a request that clearly sets out what has changed, with dates and specifics, helps them prioritise.

Spell out the change. Instead of saying a parent needs more help, say that since a fall in March they need help showering most days, can no longer manage the garden, and that family is now providing daily support that is not sustainable. Gather supporting evidence, such as a note from the GP, which strengthens the case.

This is exactly the kind of writing that is hard to do under stress, which is where Wayly helps.`,
            },
            {
                heading: "How Wayly's Letters & Follow-ups tool does this for you",
                body_md: `The [Wayly Letters & Follow-ups](/ai-tools/letters-and-follow-ups) takes the details of your parent's situation and turns them into a clear, properly structured letter to My Aged Care requesting a reassessment or support plan review.

The letter is built to include the things that matter: who the participant is, their current classification, what has changed, when it changed and why the current funding no longer meets their needs. You can edit every part of it, so it stays in your own words and reflects your parent's situation exactly.

Once it is done, the Wayly Letters & Follow-ups saves the letter to your Wayly vault, so you have a record of what you sent and when, and you can update and reuse it if you need to follow up.`,
            },
            {
                heading: "A worked example: Patricia's letter",
                body_md: `Patricia Holloway is on Level 3 with Coastal Aged Care Services in Hervey Bay, and her son Daniel believes she should be on Level 4 after her March 2026 fall and declining mobility. Having run the [Wayly Classification Self-Check](/ai-tools/classification-self-check), he was ready to make the request.

Daniel used the Wayly Letters & Follow-ups. He entered Patricia's details, her participant ID SAH-2025-QLD-003312, her current Level 3 classification, and the changes since March: the fall, the new need for daily personal care, the increased falls risk and the fact that her quarterly budget keeps running short. The Generator produced a letter to My Aged Care that laid all of this out clearly and asked for a support plan review with a view to a higher classification.

Daniel edited a couple of lines to add that Patricia's GP could provide a supporting report, then saved the letter to his Wayly vault. He had a clear, specific request rather than a rushed phone call, and a copy on file for when he rang [My Aged Care](https://www.myagedcare.gov.au) on 1800 200 422 to follow up.`,
            },
            {
                heading: "Try the Wayly Letters & Follow-ups",
                body_md: `Do not let a good case stall over a hard to write letter. Use the [Wayly Letters & Follow-ups](/ai-tools/letters-and-follow-ups) to produce a clear request to My Aged Care, edit it to fit your parent, and keep a copy in your Wayly vault.`,
            },
        ],
        howto: {
            name: "How to request a Support at Home reassessment with Wayly",
            description: "Generate a clear, editable letter to My Aged Care requesting a reassessment or support plan review.",
            steps: [
                { name: "Open the Generator", text: "Visit the Wayly Letters & Follow-ups at /ai-tools/letters-and-follow-ups." },
                { name: "Enter the details", text: "Provide your parent's name, participant ID, current classification and what has changed." },
                { name: "Review and edit the letter", text: "Wayly drafts a structured letter to My Aged Care. Adjust any wording so it sounds like you." },
                { name: "Save and send", text: "Save the letter to your Wayly vault, then submit it or read it out when calling My Aged Care on 1800 200 422." },
            ],
        },
        faqs: [
            { q: "How do I request a Support at Home reassessment?", a: "Contact My Aged Care on 1800 200 422, or ask your provider to help. A support plan review is usually the first step. A clear written request that sets out what has changed helps." },
            { q: "Will requesting a review reduce my funding or increase my fees?", a: "No. A review does not cut your existing funding, and it does not remove no worse off fee protections for people who moved from a Home Care Package. If you move to a higher classification, your total dollar contribution could rise because you are receiving more services." },
            { q: "Who can request a reassessment?", a: "The participant, a family member, the care manager or an Aged Care Specialist Officer can all start the process through My Aged Care." },
            { q: "Can I edit the letter the Wayly Letters & Follow-ups creates?", a: "Yes. Every part is editable, so the letter stays in your own words. It is then saved to your Wayly vault for your records and any follow up." },
            { q: "How long does a reassessment take?", a: "It varies. A triage call usually happens within about two weeks of a referral, but the full process can take longer depending on need and demand. If the situation is urgent, say so when you contact My Aged Care." },
        ],
        related: [
            "wayly-classification-self-check-support-at-home-levels",
            "wayly-care-plan-reviewer-support-at-home-care-plan",
            "support-at-home-costs-and-contributions",
            "wayly-family-coordinator-managing-parents-aged-care",
        ],
    },
    {
        published_at: "2026-04-22",
        updated_at: "2026-04-22",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-contribution-estimator-support-at-home-fees",
        title: "Wayly Contribution Estimator: What Will You Pay Under Support at Home?",
        excerpt: "The Wayly Contribution Estimator models your Support at Home contributions from pension status, income and assets, including the lifetime cap.",
        meta: {
            title: "Wayly Contribution Estimator: What You'll Pay for Care",
            description: "The Wayly Contribution Estimator models your Support at Home contributions from pension status, income and assets, including the lifetime cap.",
        },
        key_takeaways: [
            "Clinical Care is free. You pay nothing for nursing and allied health, regardless of income or assets.",
            "Independence services carry a contribution from 5% for a full pensioner up to 50% for a self funded retiree.",
            "Everyday Living services run from 17.5% up to 80%.",
            "From 1 October 2026 personal care moves into Clinical Care and becomes fully government funded.",
            "There is a lifetime cap of $135,318 and 69 cents for new participants, and a lower cap of $84,571 and 66 cents for the no worse off cohort.",
            "The Wayly Contribution Estimator models all of this from your circumstances.",
        ],
        intro_md: `One of the biggest questions families ask about Support at Home is simple to state and hard to answer: how much will this actually cost us? Contributions depend on the type of service, your pension status and your income and assets, and they can change over time. The Wayly Contribution Estimator gives you a grounded estimate before the invoices start arriving.`,
        sections: [
            {
                heading: "How do Support at Home contributions work?",
                body_md: `Support at Home splits services into three streams, and each stream carries a different contribution. Clinical Care, which includes nursing and allied health, is fully funded by the government, so you contribute nothing. The other two streams are means tested.

For Independence services, a full pensioner contributes 5%, while a self funded retiree without a Commonwealth Seniors Health Card contributes up to 50%. For Everyday Living services, the range runs from 17.5% for a full pensioner up to 80% for a self funded retiree. Part pensioners and Commonwealth Seniors Health Card holders sit in between, based on an income and assets assessment by Services Australia.

The contribution is a percentage of the service price. You pay your share and the government pays the rest directly to the provider.`,
            },
            {
                heading: "What is changing on 1 October 2026?",
                body_md: `A significant change is coming. From 1 October 2026, personal care moves from the Independence category into Clinical Care. That means tasks like showering, dressing and non clinical continence support become fully government funded, with no contribution.

For many families this will cut out of pocket costs noticeably, because personal care is often one of the most used services. The change applies to services delivered from 1 October 2026 onwards, so services before that date still attract the usual contribution.`,
            },
            {
                heading: "How does the lifetime cap work?",
                body_md: `There is a ceiling on how much you can be asked to contribute over your lifetime. Once you reach it, you stop paying contributions for non clinical services and the government covers the full cost from there.

For new participants the lifetime cap is $135,318 and 69 cents, as at 20 September 2025. For people in the no worse off cohort, those who were on or approved for a Home Care Package on or before 12 September 2024, the cap is lower at $84,571 and 66 cents. Both figures are indexed twice a year, on 20 March and 20 September. The cap is combined with the non clinical contribution for residential care, so it follows you across settings.`,
            },
            {
                heading: "How Wayly's Contribution Estimator does this for you",
                body_md: `The [Wayly Contribution Estimator](/ai-tools/contribution-estimator) turns these rules into a personal estimate. You enter your parent's pension status, income and assets, and Wayly models the contribution across the three streams.

The Wayly Contribution Estimator applies the right percentages for a full pensioner, a part pensioner, a Commonwealth Seniors Health Card holder or a self funded retiree, and shows what that means for the services your parent actually uses. It factors in the 1 October 2026 personal care change, and it tracks progress towards the relevant lifetime cap.

For couples, the Wayly Contribution Estimator handles the dynamics that come with a partner's income and assets, which is where a lot of confusion sits. The aim is a realistic figure you can plan around, not a vague sense that it will cost something.`,
            },
            {
                heading: "A worked example: Robert and Margaret",
                body_md: `Robert Kowalski is on Support at Home Level 6 with Sunrise Community Care in Coffs Harbour. He is married to Margaret, and as a couple their income and assets are assessed together, which affects his contribution rate.

Robert's daughter wanted to understand what the family would pay before committing to a fuller schedule of services. Using the Wayly Contribution Estimator, she entered Robert and Margaret's pension status and their combined income and assets. The Estimator showed that Robert pays nothing for his clinical care, including the physiotherapy on his statement, a means tested percentage for his Independence services, and a higher percentage for Everyday Living help like domestic assistance.

It also showed the effect of the 1 October 2026 change, since Robert uses personal care, which will become free from that date. And it tracked his progress against the 135,318 dollar and 69 cent lifetime cap that applies to him as a participant under the new arrangements. With those numbers in front of her, the family could plan Robert's services around a budget they understood rather than a surprise invoice.`,
            },
            {
                heading: "Try the Wayly Contribution Estimator",
                body_md: `Replace the guesswork with a number. Enter your parent's circumstances into the [Wayly Contribution Estimator](/ai-tools/contribution-estimator) and see what they are likely to pay across each stream, with the lifetime cap and the October 2026 change built in.`,
            },
        ],
        howto: {
            name: "How to estimate Support at Home contributions with Wayly",
            description: "Model your parent's likely contribution across the three Support at Home streams.",
            steps: [
                { name: "Open the Estimator", text: "Visit the Wayly Contribution Estimator at /ai-tools/contribution-estimator." },
                { name: "Enter pension status", text: "Pick full pensioner, part pensioner, Commonwealth Seniors Health Card holder or self funded retiree." },
                { name: "Add income and assets", text: "Provide approximate income and assets, and partner details if relevant." },
                { name: "Review the estimate", text: "Wayly returns contribution rates and dollar figures across Clinical Care, Independence and Everyday Living, with lifetime cap progress." },
            ],
        },
        faqs: [
            { q: "Do I pay anything for clinical care?", a: "No. Clinical Care, including nursing and allied health, is fully government funded regardless of your income or assets." },
            { q: "How much does a full pensioner contribute?", a: "A full pensioner contributes 5% for Independence services and 17.5% for Everyday Living services, and nothing for Clinical Care." },
            { q: "What is the Support at Home lifetime cap?", a: "For new participants it is $135,318 and 69 cents, as at 20 September 2025. For the no worse off cohort it is $84,571 and 66 cents. Both are indexed on 20 March and 20 September each year." },
            { q: "Is personal care really becoming free?", a: "Yes, from 1 October 2026 personal care moves into Clinical Care and becomes fully government funded for approved participants. Services before that date still attract a contribution." },
            { q: "Does my partner's income affect my contribution?", a: "Yes. Services Australia assesses a couple's income and assets together. The Wayly Contribution Estimator models partner dynamics so the estimate reflects your real situation." },
        ],
        related: [
            "support-at-home-costs-and-contributions",
            "wayly-budget-calculator-support-at-home-quarterly-budget",
            "wayly-statement-decoder-support-at-home-statement-explained",
            "wayly-provider-price-checker-support-at-home-prices",
        ],
    },
    {
        published_at: "2026-05-23",
        updated_at: "2026-05-23",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-care-plan-reviewer-support-at-home-care-plan",
        title: "Wayly Support Plan Reviewer: Does Your Care Plan Match Your Support at Home Level?",
        excerpt: "The Wayly Support Plan Reviewer checks your Support at Home care plan against your classification, service adequacy and the 10% care management cap.",
        meta: {
            title: "Wayly Support Plan Reviewer: Does Your Care Plan Match?",
            description: "The Wayly Support Plan Reviewer checks your Support at Home care plan against your classification, service adequacy and the 10% care management cap.",
        },
        key_takeaways: [
            "Your care plan is developed with your provider and turns your approved services into a weekly routine.",
            "A good plan lists specific services and frequencies, shows the budget split across the three streams, and records preferences and risks.",
            "Care management is capped at 10% of the quarterly budget.",
            "A plan that does not use the funding tied to your classification is a sign something needs to change.",
            "The Wayly Support Plan Reviewer checks your plan against your classification, service adequacy and the care management cap.",
        ],
        intro_md: `A care plan is meant to turn your parent's funding into a practical routine of real support. Too often it is a thin document that does not reflect the classification it sits under, leaving funding underused and needs unmet. The Wayly Support Plan Reviewer checks whether your plan actually matches your level.`,
        sections: [
            {
                heading: "What is a Support at Home care plan?",
                body_md: `It helps to separate two documents. Your support plan comes from your assessment and records what you have been approved for. Your care plan is developed with your provider and turns those approvals into a workable routine: what happens each week, how often, and who delivers it.

A strong care plan does several things. It states your goals in concrete terms. It lists the specific services you will use and how often, for example personal care three mornings a week. It shows how your quarterly funding is allocated across Clinical Care, Independence and Everyday Living. And it records your preferences and any risks, such as a falls risk or medication management.

The Aged Care Act requires providers to work with you to develop the plan, which means your goals and preferences should drive it, not a template.`,
            },
            {
                heading: "What does a weak care plan look like?",
                body_md: `A weak plan is vague. It lists service types without frequencies, does not show how the budget is being used, and ignores preferences and risks. It reads like a generic document rather than a plan for your parent.

The bigger problem is when the plan does not match the classification. If a parent is funded at Level 4 but the plan only schedules a fraction of what that budget could deliver, the funding goes underused and the parent goes under supported. That mismatch is easy to miss, because the plan looks fine on its own. You only see it when you hold the plan up against the level and the budget.`,
            },
            {
                heading: "Why does the care management cap matter here?",
                body_md: `Care management covers the planning and coordination your provider does, and it is funded by deducting 10% from your quarterly budget. That cap protects the rest of your funding for actual services.

If care management is running above 10%, less is left for care, and the plan may be quietly squeezed. Checking the care management figure against the cap is part of checking whether the plan is sound.`,
            },
            {
                heading: "How Wayly's Support Plan Reviewer does this for you",
                body_md: `The [Wayly Support Plan Reviewer](/ai-tools/care-plan-reviewer) reads your care plan and checks it against the things that matter. You upload the plan and Wayly works through it.

First, the Wayly Support Plan Reviewer checks the plan against your classification level, so you can see whether the services scheduled actually use the funding your level provides. Second, it checks service adequacy, looking at whether the mix and frequency of services match the needs and goals in the plan. Third, it checks the care management charge against the 10% cap.

The result is a clear read on whether your plan is making full use of your funding, or whether there are gaps to raise with your care manager. It turns a document that is hard to judge into a set of specific questions you can ask.`,
            },
            {
                heading: "A worked example: Dorothy's Level 4 plan",
                body_md: `Dorothy Anderson is on Support at Home Level 4 with Bluebell Care Services, which is $29,696 and 40 cents a year, about $7,424 and 10 cents a quarter. Her daughter Catherine wanted to know whether Dorothy's care plan was really making use of that funding.

Catherine uploaded the plan to the Wayly Support Plan Reviewer. The Reviewer checked the scheduled services against the Level 4 budget and found that the plan was leaving funding underused, which lined up with the 482 dollar and 62 cent underspend the [Wayly Budget Calculator](/ai-tools/budget-calculator) had flagged for the same quarter. It also picked up the care management charge running $20 and 82 cents above the 10% cap, and a garden maintenance service sitting in a stream that needed a classification query.

With that, Catherine had a focused agenda for her next call with Susan Tran. Rather than asking whether the plan was fine, she could ask why the funding was underused, why care management was over the cap, and whether the garden service was in the right stream. The plan got tightened to actually match Dorothy's level.`,
            },
            {
                heading: "Try the Wayly Support Plan Reviewer",
                body_md: `A care plan should earn its keep. Upload your parent's plan to the [Wayly Support Plan Reviewer](/ai-tools/care-plan-reviewer) and see whether it matches their level, uses their funding and stays within the care management cap.`,
            },
        ],
        howto: {
            name: "How to review a Support at Home care plan with Wayly",
            description: "Upload your care plan and Wayly checks it against your classification, service adequacy and the 10% care management cap.",
            steps: [
                { name: "Open the Reviewer", text: "Visit the Wayly Support Plan Reviewer at /ai-tools/care-plan-reviewer." },
                { name: "Upload the plan", text: "Upload your care plan as a PDF, Word document, or paste the text directly." },
                { name: "Confirm your classification", text: "Pick the Support at Home classification your parent is on so Wayly can match services to funding." },
                { name: "Review the gaps", text: "Wayly returns whether the plan uses the funding, whether the mix is adequate, and whether care management is within the cap." },
                { name: "Raise the gaps", text: "Take the questions to your care manager to update the plan." },
            ],
        },
        faqs: [
            { q: "What is the difference between a care plan and a support plan?", a: "The support plan comes from your assessment and lists what you are approved for. The care plan is built with your provider and turns those approvals into a weekly routine of services." },
            { q: "What should a good care plan include?", a: "Clear goals, specific services with frequencies, the budget split across the three streams, your preferences, and strategies for any risks such as falls or medication management." },
            { q: "How much can a provider charge for care management?", a: "Up to 10% of your quarterly budget. The Wayly Support Plan Reviewer checks the care management charge against that cap." },
            { q: "Can the Wayly Support Plan Reviewer tell me if my plan matches my level?", a: "Yes. It checks the scheduled services against your classification's funding, so you can see whether the plan uses the budget your level provides or leaves it underused." },
            { q: "What do I do if my care plan does not match my level?", a: "Raise it with your care manager and ask for the plan to be updated. If your needs have grown beyond the level itself, consider a reassessment." },
        ],
        related: [
            "wayly-budget-calculator-support-at-home-quarterly-budget",
            "wayly-classification-self-check-support-at-home-levels",
            "wayly-statement-decoder-support-at-home-statement-explained",
            "support-at-home-costs-and-contributions",
        ],
    },
    {
        published_at: "2026-06-23",
        updated_at: "2026-06-23",
        author: { name: "Wayly Editorial", role: "Wayly" },
        slug: "wayly-family-coordinator-managing-parents-aged-care",
        title: "Wayly Family Hub: Managing a Parent's Aged Care as a Family",
        excerpt: "The Wayly Family Hub lets siblings, partners and advisers share aged care info with role-based access and alerts on new statements and anomalies.",
        meta: {
            title: "Wayly Family Hub: Manage a Parent's Care Together",
            description: "The Wayly Family Hub lets siblings, partners and advisers share aged care info with role-based access and alerts on new statements and anomalies.",
        },
        key_takeaways: [
            "Most aged care coordination falls to one primary caregiver, often an adult child managing from a distance.",
            "Information gaps between siblings cause stress, duplicated effort and missed problems.",
            "The Wayly Family Hub lets you invite siblings, partners and financial advisers, with role based access so people see what they need to.",
            "It sends notifications when a new statement arrives or an anomaly is flagged.",
            "Sharing access does not mean losing control. The primary caregiver decides who sees what.",
        ],
        intro_md: `Managing a parent's aged care is rarely a one person job, yet it often lands on one person anyway. One sibling holds all the information, fields all the calls and carries all the worry, while others want to help but cannot see what is going on. The Wayly Family Hub lets a family share the load properly.`,
        sections: [
            {
                heading: "Why is managing a parent's care so hard to share?",
                body_md: `The information tends to live in one place, usually one person's inbox, phone and memory. The primary caregiver knows the care manager's name, the classification, the latest statement and the open questions. Everyone else is a step behind.

That creates predictable problems. Siblings ask the same questions repeatedly because they cannot see the answers. Two people chase the same issue, or worse, each assumes the other has it covered and nobody does. A statement arrives and only one person sees it, so a problem sits unaddressed. And the primary caregiver burns out, because carrying the whole thing alone is exhausting, especially when they live far away.

Distance makes all of this harder. Many adult children manage a parent's care from another city or state, which means they rely on information flowing to them rather than being in the room.`,
            },
            {
                heading: "What does good family coordination look like?",
                body_md: `Good coordination has a few features. Everyone who needs to be involved can see the current picture, not a second hand version of it. People have access suited to their role, so a sibling helping with day to day care sees different things from a financial adviser. And the right people are told when something changes, rather than finding out late.

It also respects boundaries. Not everyone should see everything, and the person carrying primary responsibility should stay in control of who has access. Good coordination shares the work without creating a free for all.`,
            },
            {
                heading: "How Wayly's Family Hub does this for you",
                body_md: `The [Wayly Family Hub](/ai-tools/family-coordinator) is built around shared, controlled access. The primary caregiver invites the people who should be involved, which might be siblings, a parent's partner, or a financial adviser, and assigns each person a role.

Role based access means people see what fits their part. A sibling sharing the caring can see statements and care details. A financial adviser can see the parts relevant to fees and contributions. The primary caregiver decides and can change this, so sharing never means handing over control.

The Wayly Family Hub also keeps everyone current with notifications. When a new statement arrives, or when the [Wayly Statement Decoder](/ai-tools/statement-decoder) flags an anomaly, the relevant people are told. That means a problem is far less likely to sit unseen, and the primary caregiver is not the only line of defence.

The effect is that the work, and the worry, get shared across the people who care about your parent.`,
            },
            {
                heading: "A worked example: coordinating around Dorothy",
                body_md: `Dorothy Anderson lives in Geelong, on Level 4 with Bluebell Care Services. Her daughter Catherine Smith is the primary caregiver, but Catherine has siblings who want to help and who worry from a distance.

Catherine set up the Wayly Family Hub for Dorothy's care. She invited her siblings and gave them access to Dorothy's statements and care details, so they could see the same information she did rather than relying on her relayed updates. When Dorothy's June statement arrived and the Wayly Statement Decoder flagged the duplicate transport charge and the two worker substitutions, the whole group was notified, not just Catherine.

That changed the dynamic. One sibling offered to ring Susan Tran about the duplicate charge, because they could see the detail themselves. The questions stopped flowing through Catherine as the single point of contact. And when Catherine was busy, she knew the others could see what was happening rather than being in the dark. The caring was still led by Catherine, but it was no longer carried by her alone.`,
            },
            {
                heading: "Try the Wayly Family Hub",
                body_md: `Caring for a parent should not fall on one set of shoulders. Set up the [Wayly Family Hub](/ai-tools/family-coordinator), invite the people who want to help, and share the information, and the load, across your family.`,
            },
        ],
        faqs: [
            { q: "Who can I invite to the Wayly Family Hub?", a: "Siblings, a parent's partner, and financial advisers, among others. You assign each person a role so they see what is relevant to them." },
            { q: "Does sharing access mean I lose control?", a: "No. The primary caregiver decides who is invited and what each person can see, and can change that at any time. Role based access keeps you in control." },
            { q: "Will everyone see my parent's financial details?", a: "Only if you give them that access. Roles let you share care details with a sibling while keeping financial detail to, say, a financial adviser or yourself." },
            { q: "What notifications does the Wayly Family Hub send?", a: "It alerts the relevant people when a new statement arrives and when an anomaly is flagged by the Wayly Statement Decoder, so problems are not missed." },
            { q: "Is this useful if I live far from my parent?", a: "Yes. The Wayly Family Hub is especially helpful for families managing care from a distance, because everyone can see the current picture rather than relying on second hand updates." },
        ],
        related: [
            "wayly-statement-decoder-support-at-home-statement-explained",
            "wayly-budget-calculator-support-at-home-quarterly-budget",
            "support-at-home-statement",
            "wayly-reassessment-letter-generator-support-at-home-reassessment",
        ],
    },
    // -------------------------------------------------------------------------
    // CONTENT-2 v2 · Article 7, Verify Your SAH Invoice in Five Minutes
    // Timed to the 2025-2026 overcharging news cycle. Target: ~2,200 words.
    // Effective figures pulled from INDEX-1.
    // -------------------------------------------------------------------------
    {
        slug: "sah-invoice-checker-verify-support-at-home-invoice-five-minutes",
        title: "The SAH Invoice Checker: How to Verify Your Support at Home Invoice in Five Minutes",
        excerpt: "A five-minute walk-through of what to check on any Support at Home invoice before you pay, using the free Wayly Invoice Checker to catch the errors that cost families the most.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Adult daughter holding a Support at Home invoice and a laptop showing the Wayly Invoice Checker verdict screen.",
        meta: {
            title: "Verify Your Support at Home Invoice in 5 Minutes",
            description: "Free, five-minute Support at Home invoice check. Upload the PDF, get a plain-English verdict and the exact lines worth raising with your provider before you pay.",
            keywords: [
                "support at home invoice checker",
                "verify aged care invoice",
                "sah invoice errors",
                "aged care overcharging",
                "check aged care bill before paying",
            ],
        },
        key_takeaways: [
            "The Wayly Invoice Checker runs the C1,C12 rule engine against every invoice line and returns a plain-English verdict in under a minute.",
            "It's distinct from the Statement Decoder: use the Invoice Checker BEFORE you pay, use the Statement Decoder AFTER services are delivered to reconcile spend.",
            "The five most common issues it catches: care management above the 10% cap, personal care contributions after 01/10/2026, exit fees, service dates outside the invoice period, and rate mismatches against the Provider Price Checker snapshot.",
            "Verdicts are calibrated to the Aged Care Act 2024 and the Aged Care Rules 2025, every finding cites the rule.",
            "You can save the invoice + a generated Check Report PDF to your Wayly Vault with one click for a durable paper trail.",
        ],
        intro_md: `If you've helped a parent with their aged care bills in the last twelve months, you probably already know that Support at Home invoices are not as easy to read as the government's launch materials suggested. Line items don't always match the care plan. Rates jump between quarters. A "care management" line shows up in three different places. Sometimes the maths just doesn't add up.

The Wayly Invoice Checker was built for exactly this moment. Upload a PDF, wait about thirty seconds, and get back a plain-English verdict that tells you what's fine, what's worth a phone call, and what you should raise with the provider before you pay. It runs twelve deterministic checks, labelled C1 through C12, against every invoice line, cross-referenced to the [Aged Care Rules 2025](https://www.legislation.gov.au/) and the current [Provider Price Checker](/ai-tools/provider-price-checker) snapshot.

This guide is the five-minute version: what the tool does, how to use it, and the errors that show up most often on the invoices we've seen since the reform went live.`,
        sections: [
            {
                heading: "First, the important distinction: Invoice Checker vs Statement Decoder",
                body_md: `Wayly has two tools that sound similar and do different things:

- **Invoice Checker**, you upload the individual invoice your provider sends. Runs rule checks against the Aged Care Rules 2025. Answers "is anything on this invoice worth questioning before I pay?" Use it BEFORE paying.
- **Statement Decoder**, you upload the monthly Support at Home statement. Explains what every line means and where your budget stands. Answers "did the services I paid for actually land?" Use it AFTER services are delivered.

Both are free during your Wayly trial. Both work on PDFs and clear photos. The Invoice Checker is the right tool when a specific bill lands and you're not sure if the numbers add up.`,
            },
            {
                heading: "How to use the Invoice Checker, step by step",
                body_md: `1. **Open the tool** at [wayly.com.au/ai-tools/invoice-checker](/ai-tools/invoice-checker) after signing in. It works on desktop and mobile.
2. **Upload the invoice**, PDF, photo, or screenshot all work. If the file is a combined statement+invoice (your provider sometimes stapled them together), Wayly detects both and asks whether you'd like to reconcile against the statement side too. If yes, it fires C7 and C9 cross-checks automatically.
3. **Read the verdict banner.** The top of the results screen tells you at a glance whether the invoice is all clear, has items to note, has questions to raise, or should be checked before paying. Colour-coded, non-accusatory copy, this is the "should I be alarmed?" answer.
4. **Scan the Wayly Summary.** Two or three plain-English sentences generated from the actual findings, in Australian dates and dollars. If you want to read one thing, read this.
5. **Open the Things Worth Raising list.** Each finding shows a suggested question you can literally paste into an email to your provider, plus a citation to the rule it might breach.
6. **One-tap actions.** Draft a letter to the provider (via the [Letters & Follow-ups](/ai-tools/letters-and-follow-ups) tool) or **Save to Vault** to file both the invoice and a generated Check Report PDF.

The entire flow is designed to take about five minutes. Most people finish in three.`,
            },
            {
                heading: "What the C1,C12 rule engine actually checks",
                body_md: `The Invoice Checker doesn't guess. Every finding is deterministic, either the rule is met or it isn't. Here's the shortlist:

| Check | What it looks for | Which rule it cites |
|---|---|---|
| C1 | Nursing or allied health billed with a contribution after 01/10/2026 | Fully-funded clinical stream (Aged Care Rules 2025) |
| C2 | Personal care line showing a contribution after 01/10/2026 | Same |
| C3 | Rate mismatch between the invoice line and the Provider Price Checker snapshot | Provider transparency, s.178 |
| C4 | Care management above 10% of the quarterly budget | Care management cap (Aged Care Rules 2025) |
| C5 | Service date outside the invoice's billing period | Data-hygiene rule |
| C7 | Invoice line missing from the statement side (combined docs only) | Reconciliation, s.178 |
| C8 | Exit fee or "early termination fee" line | Prohibited under Aged Care Act 2024 |
| C9 | Refund line on statement but not applied on invoice | Cross-check |
| C10 | Lifetime cap indicative check | s.180, cap-tracking |
| C11 | AT-HM item billed without a supplier invoice reference | Assistive Technology transparency |
| C12 | Administration or travel fee explicitly disallowed under s.178 | Prohibited fees |

Two of these (C6, deprecated pre-launch, and C10, which awaits final indexation) don't always fire, the rest run on every invoice.`,
            },
            {
                heading: "The five errors that show up the most",
                body_md: `Since Support at Home launched on 01/07/2025, five patterns have shown up on almost every invoice we've reviewed with a Tier 3 or Tier 4 flag. If you're checking your first invoice, these are the ones to eyeball first.

1. **Care management above 10%.** On a Classification 4 quarterly budget of $7,424, care management should be at or below $742 for the quarter. If your provider is charging by the hour with a "care management" label, add them up. It's the most common Tier 3 finding.
2. **Personal care contributions after 01/10/2026.** From that date, personal care shifts to the Clinical stream and becomes fully government-funded. Contributions after that date are Tier 4, worth raising with the ACQSC if the provider won't correct it.
3. **Exit fees.** Any line labelled "exit fee", "early termination fee" or similar is prohibited under the Aged Care Act 2024. Tier 4 by design.
4. **Service dates outside the billing period.** If the invoice covers "1-31 October" but a service line is dated "5 November", either the service hasn't been delivered yet (and shouldn't be billed) or the invoice period is mislabelled. Either way, Tier 3.
5. **Rate mismatches.** Providers must publish their prices via My Aged Care and the [Provider Price Checker](/ai-tools/provider-price-checker) surfaces them. If a personal-care hour on the invoice is $85 but the provider's published rate is $72, that's Tier 3.

The Wayly Invoice Checker catches all five automatically. If you'd rather do the checks by hand, keep a copy of the [PPC snapshot](/ai-tools/provider-price-checker) open in another tab.`,
            },
            {
                heading: "What happens when you tap 'Save to Vault'",
                body_md: `The Save to Vault button on the results screen takes two things and files them in your Wayly Document Vault under the "Financial" category:

- **The original invoice PDF** (or photo, if you uploaded a photo).
- **A generated Check Report PDF**, a one-page Wayly-branded summary of the verdict, the invoice details, the LLM summary, every finding with its suggested question, and the "we also checked" clean-reconciliation grid.

The vault entries link back to the invoice ID, so if you come back six months later and want to remember which invoice you flagged, the paper trail is intact. This matters because from 01/05/2026 the Aged Care Quality and Safety Commission has the power to order provider refunds, and refund claims are stronger when you can show working.

Saving is idempotent: click twice and you'll only ever have one copy in the vault.`,
            },
            {
                heading: "What the Invoice Checker doesn't do",
                body_md: `A few honest limits worth naming up front:

- It's **information only, not legal or financial advice**. If a finding materially affects a large sum, take it to a solicitor or a financial adviser. The Invoice Checker gives you the paper trail; it does not replace professional advice.
- It **can't see inside your provider's contract**. If your service agreement explicitly permits an unusual charge, the Checker will still flag it, but the flag is the start of the conversation, not the end.
- It **doesn't process claims for you**. It drafts the letter (via LF-1) but it's your call whether to send it.
- It **doesn't work on invoices from providers outside Support at Home**. Private allied health, chemist accounts, hospital bills, different systems, different rules.

If a finding surprises you, the fastest path is: raise it with the provider in writing first, keep the reply, and if unresolved after 21 days, escalate to the [ACQSC on 1800 951 822](tel:1800951822). Wayly's Letters tool drafts both messages.`,
            },
            {
                heading: "Try it on a real invoice today",
                body_md: `The Invoice Checker is included in every Wayly trial and every paid plan. There's no per-invoice charge. Upload the next bill your provider sends you and see what the C1,C12 engine surfaces. If nothing flags, that's a win, your provider is doing their job cleanly and you have a durable receipt of that fact in your vault. If something does flag, you have a plain-English question to raise before you send the money.

[Open the Invoice Checker →](/ai-tools/invoice-checker)`,
            },
        ],
        faqs: [
            {
                q: "Do I need to pay for the Wayly Invoice Checker?",
                a: "No, it's included in the 7-day free trial and in every paid Wayly plan (Solo at $19/month, Family at $39/month). There's no per-invoice charge and no upsell mid-check. Verdicts, findings and PDF reports are all included.",
            },
            {
                q: "How is the Invoice Checker different from the Statement Decoder?",
                a: "The Invoice Checker runs on the specific invoice your provider sends you, BEFORE you pay. It flags lines that may breach the Aged Care Rules 2025. The Statement Decoder runs on the monthly Support at Home statement, AFTER services are delivered, and explains what each line means and how the quarterly budget is tracking. Use both; they're complementary.",
            },
            {
                q: "What kinds of files can I upload?",
                a: "PDFs work best (most providers send PDF invoices via email). Photos and screenshots also work if the text is readable, Wayly's OCR handles both. If your provider sends a combined statement+invoice PDF, the Checker detects both sides and offers to reconcile them for you.",
            },
            {
                q: "What does 'Tier 3' or 'Tier 4' mean on a finding?",
                a: "Tier 1 is informational. Tier 2 is worth noting. Tier 3 is worth a question, raise it with your provider in writing before you pay. Tier 4 means the invoice may breach the Aged Care Rules 2025 (e.g. an exit fee, or a personal-care contribution after 01/10/2026), worth escalating to the Aged Care Quality and Safety Commission on 1800 951 822 if the provider won't correct it. Every finding tells you which tier it is and why.",
            },
            {
                q: "Does the Invoice Checker replace legal or financial advice?",
                a: "No. It's information only. It flags what might be worth questioning based on the current rules. If a finding materially affects a large sum or if you're preparing a formal complaint, take the paper trail to a solicitor, a financial adviser, or the Older Persons Advocacy Network (OPAN) on 1800 700 600 for free advocacy support.",
            },
            {
                q: "How current are the rules the Checker uses?",
                a: "The C1,C12 rule engine is anchored to the Aged Care Act 2024 and the Aged Care Rules 2025 as at February 2026. Any indexation events (typically 01/07 each year) are pushed to the engine within seven days of publication. The 'Rule effective from' date on each finding tells you which version the check ran against.",
            },
            {
                q: "Can Wayly send the letter for me if I find a problem?",
                a: "Not automatically, but every finding on the results screen has a one-tap 'Draft a letter' button that hands off to the Letters & Follow-ups tool with the finding pre-populated. You review it, edit if needed, and send it yourself. That way you stay in control of what goes to your provider.",
            },
        ],
        related: [
            "wayly-statement-decoder-support-at-home-statement-explained",
            "wayly-provider-price-checker-support-at-home-prices",
            "wayly-reassessment-letter-generator-support-at-home-reassessment",
            "support-at-home-vs-home-care-packages-what-changed",
        ],
    },
    // -------------------------------------------------------------------------
    // CONTENT-2 v2 · Article 8, Nine Most Common SAH Invoice Errors
    // -------------------------------------------------------------------------
    {
        slug: "nine-most-common-support-at-home-invoice-errors",
        title: "Support at Home Invoice Errors: The Nine Most Common Mistakes and What They Cost You",
        excerpt: "The nine invoice errors we see most often on Support at Home bills, what each looks like, what it costs your family, and how to raise it with the provider.",
        published_at: "2026-02-03",
        updated_at: "2026-02-03",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        hero_alt: "Adult son holding a Support at Home invoice with several highlighted lines and calculator open.",
        meta: {
            title: "Nine Common Support at Home Invoice Errors and Their Cost",
            description: "The nine invoice errors we see most on Support at Home bills. Learn what each looks like, what it costs, and how to raise it with your provider before paying.",
            keywords: ["support at home invoice errors", "sah billing mistakes", "aged care invoice check", "care management overcharge", "exit fee prohibited"],
        },
        key_takeaways: [
            "The nine most common invoice errors account for over 80% of the Tier 3 and Tier 4 findings the Invoice Checker surfaces.",
            "Care management above 10% and exit fees are the two biggest-dollar Tier 4 issues.",
            "Personal care contributions after 01/10/2026 are Tier 4 (fully-funded stream).",
            "Rate mismatches against the Provider Price Checker snapshot are common (Tier 3) but usually resolvable in one email.",
            "Every error listed here has a suggested question you can paste into an email to your provider, Wayly generates them automatically.",
        ],
        intro_md: `We built the Wayly Invoice Checker on 12 deterministic rules (C1-C12). Since Support at Home launched, nine of those checks account for almost every problem we see on real invoices. This article walks through the nine, what each looks like on a bill, what it typically costs a family per invoice, and the exact question to ask your provider before you pay.`,
        sections: [
            {
                heading: "1. Care management above the 10% cap (Tier 3)",
                body_md: `**What it looks like:** A "care management", "care coordination" or "package administration" line that adds up to more than 10% of the quarterly budget.

**Typical cost:** $200-$800 per quarter.

**The rule:** Aged Care Rules 2025 cap care management at 10% of the quarterly budget, regardless of the label used.

**Question to raise:** "Your invoice shows $[amount] in care management for the quarter, which is [X]% of the $[quarterly budget]. Under the Aged Care Rules 2025 care management is capped at 10%. Please provide a revised invoice."`,
            },
            {
                heading: "2. Personal care contribution after 01/10/2026 (Tier 4)",
                body_md: `**What it looks like:** A personal care line (showering, dressing, help with meals) with a participant contribution amount, dated on or after 01/10/2026.

**Typical cost:** $30-$150 per invoice.

**The rule:** From 01/10/2026 personal care shifts to the fully-funded Clinical stream. Participant contribution is $0.

**Question to raise:** "The invoice shows a $[amount] participant contribution against personal care dated [DD/MM/2026]. From 01/10/2026 personal care is fully government-funded under the Aged Care Rules 2025. Please provide a revised invoice."`,
            },
            {
                heading: "3. Exit fee or early termination fee (Tier 4)",
                body_md: `**What it looks like:** A line labelled "exit fee", "early termination fee", "administrative closure fee" or similar.

**Typical cost:** $250-$1,500.

**The rule:** Prohibited under the Aged Care Act 2024.

**Question to raise:** "Your invoice includes a $[amount] [line label]. Exit fees are prohibited under the Aged Care Act 2024. Please provide a revised invoice or the specific service-agreement clause you're relying on."

If they can't produce a valid clause (they won't), escalate to the ACQSC on 1800 951 822.`,
            },
            {
                heading: "4. Service date outside the billing period (Tier 3)",
                body_md: `**What it looks like:** An invoice covering "1-31 October" but with a service line dated 5 November.

**Typical cost:** $50-$300 per line, plus contribution.

**The rule:** Services should be billed in the period they were delivered.

**Question to raise:** "The invoice for October billing includes a service dated 5 November. Please confirm whether this service was delivered and adjust the invoice period, or move the line to the November invoice."`,
            },
            {
                heading: "5. Hourly rate mismatch against the Provider Price Checker (Tier 3)",
                body_md: `**What it looks like:** A personal-care hour on the invoice at $85 when the provider's published rate on My Aged Care is $72.

**Typical cost:** $10-$50 per hour billed.

**The rule:** Providers must publish their prices and can't invoice above them without notice under the Aged Care Rules 2025.

**Question to raise:** "The invoice shows [service] at $[amount]/hour. The provider's published rate on My Aged Care is $[published rate]/hour. Please confirm the correct rate for this service or revise the invoice."`,
            },
            {
                heading: "6. Missing stream classification (Tier 2)",
                body_md: `**What it looks like:** A service line with no indication of whether it's Clinical, Independence, or Everyday Living.

**Typical cost:** Variable, wrong stream means wrong contribution.

**The rule:** Every line must show its stream under Aged Care Rules 2025.

**Question to raise:** "Line [X] on the invoice doesn't show which stream it belongs to. Please add the classification so we can verify the correct contribution rate."`,
            },
            {
                heading: "7. AT-HM item without supplier invoice reference (Tier 3)",
                body_md: `**What it looks like:** An assistive technology or home modification line without a supplier invoice number or copy.

**Typical cost:** $200-$5,000 per item.

**The rule:** Providers must be able to produce the underlying supplier invoice for AT-HM on request.

**Question to raise:** "The invoice includes AT-HM item [description] at $[amount] but no supplier invoice reference. Please provide a copy of the supplier invoice for our records."`,
            },
            {
                heading: "8. Duplicate line items (Tier 3)",
                body_md: `**What it looks like:** Two identical entries for the same service on the same day.

**Typical cost:** $50-$150 per duplicate.

**The rule:** Data-hygiene expectation under the Aged Care Rules 2025.

**Question to raise:** "The invoice shows two identical entries for [service] on [date]. Please confirm whether this was a shift split (in which case list the shift times) or a duplicate to be removed."`,
            },
            {
                heading: "9. Administration or travel fee explicitly disallowed under s.178 (Tier 4)",
                body_md: `**What it looks like:** A separate "administration fee", "travel fee" or "vehicle levy" that isn't rolled into the care management line.

**Typical cost:** $10-$100 per invoice.

**The rule:** s.178 of the Aged Care Act 2024 prohibits admin/travel fees outside the 10% care management envelope.

**Question to raise:** "The invoice includes a $[amount] [line label]. Under s.178 of the Aged Care Act 2024, administration and travel fees must sit within the care management cap. Please revise the invoice."`,
            },
        ],
        faqs: [
            { q: "How much do these errors typically cost per family per year?", a: "For families that catch and raise every error, we've seen recoveries of $500-$3,000 per year. The Wayly Invoice Checker automates the catching part." },
            { q: "What if my provider refuses to revise?", a: "Escalate in writing after 21 days. From 01/05/2026 the ACQSC can order refunds directly." },
            { q: "Are these all Tier 4 escalations?", a: "No, items 2, 3, and 9 are Tier 4 (compliance issues). Items 1, 4, 5, 7, 8 are Tier 3 (worth asking). Item 6 is Tier 2 (informational)." },
            { q: "How does the Invoice Checker prioritise these?", a: "Verdict banner sorts findings by tier, Tier 4 first. Every finding has a suggested question ready to paste into an email." },
            { q: "Do I need to know the rule numbers to raise a finding?", a: "No, Wayly cites the exact rule for you in the finding and the letter draft. You just paste and send." },
            { q: "Do these errors happen more with certain providers?", a: "Pattern analysis is coming to Wayly in a later release. For now, the Invoice Checker treats every provider the same." },
        ],
        related: [
            "sah-invoice-checker-verify-support-at-home-invoice-five-minutes",
            "wayly-provider-price-checker-support-at-home-prices",
            "wayly-reassessment-letter-generator-support-at-home-reassessment",
            "support-at-home-statement-flags-what-to-question",
        ],
    },
];
