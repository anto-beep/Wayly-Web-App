// Batch 1 of the "Wayly 49 Article Copy and Implementation Plan" (Nov 2026).
// These objects OVERRIDE the matching slug in seoArticles2026.js at both the
// index and the detail renderer. Copy is the verified editorial draft; titles,
// headings and subheadings are Title Case; body and buttons are sentence case.
// `next_step` maps to WAYLY_OFFER keys; `sources` renders a Sources section.
// Each article keeps its existing slug (URL unchanged) and its hero image.

export const PDF_ARTICLES_2026 = [
    {
        slug: "how-much-will-i-pay-for-support-at-home",
        title: "How Much Will I Pay for Support at Home?",
        excerpt: "Your provider's price and your assessed contribution rate answer two different questions. Here is how to work out your share from your fee advice, estimate a familiar visit, and what to do if the amount is unaffordable.",
        published_at: "2026-11-05",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "How much will I pay for Support at Home? | Wayly",
            description: "Your provider's price and your assessed contribution rate answer two different questions. Work out your share from your fee advice, with a worked visit example and the hardship pathway.",
        },
        intro_md: `Your provider's price and your assessed contribution rate answer two different questions. The first tells you what the service costs. The second helps determine the share you pay. Services Australia assesses the rate that applies to your circumstances.`,
        sections: [
            {
                heading: "Work From Your Fee Advice",
                body_md: `Find your contribution rates and their effective date. Approved clinical supports carry a zero contribution. Under standard arrangements, full pensioners generally contribute 5% towards independence services and 17.5% towards everyday living. Other rates depend on means and fee arrangements. If you previously had a Home Care Package, check which arrangements your letter names before using a standard example.`,
            },
            {
                heading: "Estimate a Familiar Visit",
                body_md: `Suppose your cleaning visit costs $80 and your everyday living rate is 17.5%. Your share would be $14 for that visit. Four equivalent visits would total $56. A different provider price or a different number of visits changes that total. If the assessed amount is unaffordable, ask Services Australia about financial hardship assistance. A full or partial reduction may be available after assessment.`,
            },
            {
                heading: "What If I Cannot Afford the Contribution?",
                body_md: `Services Australia assesses financial hardship assistance using form SA462. Check its instructions for supporting evidence, including essential expenses. Tell your Support at Home provider as soon as you lodge your claim so it can pause contributions during assessment. If the claim is unsuccessful, the suspended amounts become payable. Ask the provider to confirm in writing how it is recording them. You can apply for government assistance independently of Wayly.`,
            },
        ],
        next_step: {
            invite: "Enter one service you actually use in the Contribution Estimator. Compare the estimate with your fee advice before relying on it.",
            primary: "estimator",
            trial: true,
        },
        sources: [
            { label: "My Aged Care funding tables and contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "Official contribution schedules", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Financial hardship assistance", href: "https://www.myagedcare.gov.au/financial-hardship-assistance" },
            { label: "Services Australia hardship application (SA462)", href: "https://www.servicesaustralia.gov.au/sa462" },
        ],
        related: ["wayly-contribution-estimator-support-at-home-fees", "support-at-home-financial-hardship-assistance"],
    },
    {
        slug: "what-happened-to-my-home-care-package",
        title: "What Happened to My Home Care Package?",
        excerpt: "If you were on a Home Care Package when Support at Home started on 1 November 2025, your care moved across. Here is how to read your new quarterly budget and find a familiar visit that looks different.",
        published_at: "2026-11-04",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "What happened to my Home Care Package? | Wayly",
            description: "Your Home Care Package moved to Support at Home on 1 November 2025. How to read your new quarterly budget, which fee rules apply, and what to do if a familiar visit has disappeared.",
        },
        intro_md: `If you were receiving a Home Care Package when Support at Home started on 1 November 2025, your care moved across. You did not have to start a new application simply because the program changed. The paperwork now describes a quarterly budget, and your first statement may use different names for familiar services.`,
        sections: [
            {
                heading: "Where Did My Package Balance Go?",
                body_md: `Ask your provider to show you three figures separately: your opening Support at Home budget, any unspent Home Care Package funds and what has been used since the change. Different rules apply to money carried across from the old program. A smaller number on the front page may only be one part of the picture.`,
            },
            {
                heading: "Which Fee Rules Apply to Me?",
                body_md: `Find your original approval letter. If you were already receiving a package on 12 September 2024, or had approval and were waiting for a package by then, special contribution arrangements apply. Give Services Australia your approval date if your fee advice looks unexpected. Your provider can explain the price of each visit.`,
            },
            {
                heading: "What to Do If a Familiar Visit Has Disappeared",
                body_md: `Start with your service agreement and ask your provider to compare the old schedule with the new one.

> "My Thursday domestic assistance used to appear twice a month. I can only see one visit on the new schedule. Is this a change to the plan, a booking still to be made or a difference in how it is recorded?"

Request the answer and the next visit date in writing.`,
            },
        ],
        next_step: {
            invite: "Have your first new statement handy? Decode it to see which figures are worth taking to your next provider call.",
            primary: "free_decode",
            trial: true,
        },
        sources: [
            { label: "Former Home Care Package fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
            { label: "Managing quarterly and retained balances", href: "https://www.myagedcare.gov.au/support-at-home" },
        ],
        related: ["support-at-home-no-worse-off", "home-care-package-levels-support-at-home-classifications"],
    },
    {
        slug: "support-at-home-explained",
        title: "Support at Home Explained for Someone Starting Care",
        excerpt: "Support at Home helps eligible older people get care at home. Here is how it runs from assessment to the first visit, what to check before you sign an agreement, and who can ask about an assessment.",
        published_at: "2026-11-03",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "Support at Home explained for someone starting care | Wayly",
            description: "How Support at Home works from assessment to the first visit, what to check before you sign a service agreement, and who can ask My Aged Care about an assessment.",
        },
        intro_md: `Support at Home helps eligible older people get care at home. If the household is struggling with meals, transport or getting ready in the morning, write down which tasks have become difficult, who helps now and what happens when that person is unavailable.`,
        sections: [
            {
                heading: "From Assessment to the First Visit",
                body_md: `Contact My Aged Care on 1800 200 422 to ask about an assessment. Your outcome letter explains what has been approved. Funding allocation and the availability of a provider affect when visits can begin. If you receive interim funding, ask which services can start now and what will be reviewed when more funding becomes available.`,
            },
            {
                heading: "Before You Sign an Agreement",
                body_md: `Ask the provider to show you a sample week with the service, visit length, price and estimated amount you will pay. Approved clinical supports have a zero participant contribution. Other services can attract contributions depending on your circumstances. Ask who to call if your needs change before the first visit.`,
            },
            {
                heading: "Who Can Ask About an Assessment?",
                body_md: `My Aged Care generally starts with age and support needs. Its requirements checker lists age 65 or over, or 50 or over for Aboriginal or Torres Strait Islander people, alongside changes in daily life or available support. If you are unsure how the criteria apply, contact My Aged Care. You can have a trusted person beside you for that conversation.`,
            },
        ],
        next_step: {
            invite: "New to the paperwork? Try the example in Wayly's free Statement Decoder to see what a monthly statement can tell you.",
            primary: "free_decode",
            trial: true,
        },
        sources: [
            { label: "Who can apply for assessment", href: "https://www.myagedcare.gov.au/assessment" },
            { label: "How aged care assessment works", href: "https://www.myagedcare.gov.au/assessment" },
            { label: "My Aged Care funding tables and contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
        ],
        related: ["home-care-package-levels-support-at-home-classifications", "how-much-will-i-pay-for-support-at-home"],
    },
    {
        slug: "three-streams-clinical-independence-everyday-living",
        title: "The Three Support at Home Contribution Categories",
        excerpt: "A nurse visit, a transport service and a cleaning visit can have different contribution rates. The three categories describe how services are treated when working out what you pay.",
        published_at: "2026-11-02",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "The three Support at Home contribution categories | Wayly",
            description: "Clinical supports, independence and everyday living are treated differently when working out what you pay. How to read each line of a mixed Support at Home statement.",
        },
        intro_md: `A nurse visit, a transport service and a cleaning visit can have different contribution rates. The three categories describe how services are treated when working out what you pay. You can check each line of a mixed statement separately.`,
        sections: [
            {
                heading: "Clinical Supports, Independence and Everyday Living",
                body_md: `Clinical supports such as approved nursing have no participant contribution. Approved personal care delivered from 1 October 2026 also has no participant contribution. Independence includes eligible services such as transport. Everyday living includes eligible domestic assistance, such as cleaning. Check your fee advice for the rates that apply to the latter two categories.`,
            },
            {
                heading: "A Quick Way to Read a Mixed Statement",
                body_md: `Underline the service description, circle the date and find the amount payable by you. If a worker helped with dressing and housework during one visit, ask the provider to explain how it classified and priced the services. A single worker can deliver tasks treated differently under the rules.`,
            },
        ],
        next_step: {
            invite: "Use the free decoder to identify the categories on your own statement and prepare a question about any unclear line.",
            primary: "free_decode",
            trial: true,
        },
        sources: [
            { label: "Official contribution schedules", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["how-much-will-i-pay-for-support-at-home", "support-at-home-statement"],
    },
    {
        slug: "lifetime-contribution-cap-most-families-do-not-worry",
        title: "How the Support at Home Lifetime Contribution Cap Works",
        excerpt: "The lifetime cap is a limit on eligible contributions over time. Here is which cap applies, how you will be told when you reach it, and what to check if bills continue after the letter.",
        published_at: "2026-11-01",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "How the Support at Home lifetime contribution cap works | Wayly",
            description: "The lifetime cap limits eligible contributions over time. Which cap applies ($140,652.80 or $88,934.57), how Services Australia tells you, and what to check if bills continue after the letter.",
        },
        intro_md: `The lifetime cap is a limit on eligible contributions over time. Your quarterly budget tells you how much funding you can use for care in that period. Keep the two figures separate when reading your statement.`,
        sections: [
            {
                heading: "Which Cap Applies?",
                body_md: `As at 20 September 2026, My Aged Care lists $140,652.80 for standard arrangements that began on 1 November 2025 and $88,934.57 for eligible people covered by the no worse off arrangements. These figures are indexed. People who received or were approved for a Home Care Package before 1 July 2014 are regarded as having reached their lifetime cap.`,
            },
            {
                heading: "How Will I Know?",
                body_md: `Services Australia writes to you and your provider when you reach the cap. If you think you are close, ask which contribution history has been included and what date applies. A service price includes more than your personal share, so adding up the full prices on your statements will give a misleading total.`,
            },
            {
                heading: "If Bills Continue After the Letter",
                body_md: `Check the effective date and service periods. Some invoices arrive after a visit and may cover an earlier period. If a line relates to a later service, ask the provider how it applied the letter and whether a correction is due. Keep the letter, invoice and response together.`,
            },
        ],
        next_step: {
            invite: "Use Wayly to understand which column records your personal contribution. Confirm your official history with Services Australia.",
            primary: "free_decode",
            trial: true,
        },
        sources: [
            { label: "Lifetime caps and changes to contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "Pre-July 2014 fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
        ],
        related: ["how-much-will-i-pay-for-support-at-home", "support-at-home-no-worse-off"],
    },
];

export const PDF_ARTICLE_OVERRIDES = PDF_ARTICLES_2026.reduce((acc, a) => {
    acc[a.slug] = a;
    return acc;
}, {});
