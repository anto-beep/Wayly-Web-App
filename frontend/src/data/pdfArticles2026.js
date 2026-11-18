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
    {
        slug: "how-to-complain-about-aged-care-commission",
        title: "How to Complain About Aged Care in Australia: What Actually Happens",
        excerpt: "You can raise a concern about a missed visit, a charge you cannot explain or the way you were treated. Here is who to contact, what the Commission actually does, and a complaint you can adapt.",
        published_at: "2026-10-28",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "How to complain about aged care in Australia | Wayly",
            description: "Who to contact about a missed visit or a charge you cannot explain, what the Aged Care Quality and Safety Commission does, and a complaint script you can adapt.",
        },
        intro_md: `You can raise a concern about a missed visit, the way someone spoke to you, a charge you cannot explain or another aspect of your care. Start by writing down what happened, how it affected you and what you would like to happen next.`,
        sections: [
            {
                heading: "A Complaint You Can Adapt",
                body_md: `> "I arranged help with showering for Monday morning. No worker arrived and I did not receive a call. I had to wait until my daughter finished work. Please explain what happened, confirm my next visit and tell me who I can ring if the worker is delayed again."

Include the date and the best way to contact you. Keep a copy of the reply.`,
            },
            {
                heading: "Choose Who You Want to Speak To",
                body_md: `You can contact your provider or go directly to the Aged Care Quality and Safety Commission on **1800 951 822**. Ask how your concern will be handled and when to expect the next update. For free, independent help explaining your wishes or preparing for a conversation, call the Older Persons Advocacy Network on **1800 700 600**.`,
            },
            {
                heading: "What Happens After I Contact the Commission?",
                body_md: `The Commission says it acknowledges a complaint within three business days. It listens, considers risk and discusses what you would like to happen. An acknowledgement tells you it has received your concern. The time needed to resolve the issue depends on the circumstances. Tell the Commission how you want to be contacted and whether you would like an interpreter. If you are helping someone else, ask what outcome they want before speaking for them.`,
            },
        ],
        next_step: {
            invite: "Use free Ask Wayly for a general question about the process. If you want to turn your notes into a letter, explore Letters & Follow-ups in the separate 7-day trial.",
            primary: "ask_wayly",
            secondary: "letters",
        },
        sources: [
            { label: "Commission complaints and next steps", href: "https://www.agedcarequality.gov.au/making-complaint" },
            { label: "Know your aged care rights", href: "https://www.agedcarequality.gov.au/older-australians/your-rights" },
        ],
        related: ["the-statement-of-rights", "support-at-home-financial-hardship-assistance"],
    },
    {
        slug: "support-at-home-statement-vs-invoice-explained",
        title: "Support at Home Statement vs Invoice: What's the Difference and Why It Matters",
        excerpt: "The statement explains what happened to your funding. The invoice tells you what to pay. Here is how the figures fit together, what to do when they do not match, and how to handle a due date.",
        published_at: "2026-10-27",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "Support at Home statement vs invoice | Wayly",
            description: "The statement explains what happened to your funding; the invoice is what you pay. How the figures fit together, what to do when they do not match, and how to handle a due date.",
        },
        intro_md: `The statement explains what happened to your care funding during the month. The invoice tells you what the provider is asking you to pay. Some providers send them together. Look for the headings, service period, amount payable and any due date.`,
        sections: [
            {
                heading: "How the Figures Fit Together",
                body_md: `For an illustrative $100 visit with a $15 participant contribution, the statement may show $100 as the total service price and the invoice may ask you for $15. Seeing the visit on both documents does not by itself mean that you have been billed twice. Match the dates and units, then check which amount is actually requested.`,
            },
            {
                heading: "When the Figures Do Not Match",
                body_md: `Ask whether the invoice covers a different period, includes a credit or shows a late adjustment. You can write:

> "My statement and invoice show different contribution totals. Please reconcile them by service date and confirm the amount and due date while you check."

Keep a copy of your agreement.`,
            },
            {
                heading: "If the Invoice Is Due Before You Get a Reply",
                body_md: `Contact the provider before the due date. Give the invoice number, identify the line you queried and ask what payment it expects while it investigates. Request written confirmation of any arrangement. If the concern is affordability, you can also seek hardship information while the billing query is being checked.`,
            },
        ],
        next_step: {
            invite: "Have a statement? Start with a free decode. Have an invoice with an amount due? The separate Invoice Checker is available in the 7-day trial.",
            primary: "free_decode",
            secondary: "invoice_checker",
        },
        sources: [
            { label: "Official monthly statement requirements", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Financial hardship assistance", href: "https://www.myagedcare.gov.au/financial-hardship-assistance" },
        ],
        related: ["support-at-home-statement", "nine-most-common-support-at-home-invoice-errors"],
    },
    {
        slug: "support-at-home-statement",
        title: "How to Read Your Monthly Support at Home Statement",
        excerpt: "Start with the period covered, then follow the opening balance, services, adjustments and closing balance in order. Here is how to read the line descriptions and share a statement with family.",
        published_at: "2026-10-26",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "How to read your monthly Support at Home statement | Wayly",
            description: "Follow the opening balance, services, adjustments and closing balance in order, read the line descriptions, and share a statement cleanly with a family member who lives elsewhere.",
        },
        intro_md: `Start with the period covered. Then read the opening balance, services, adjustments and closing balance in that order. If your statement runs to several pages, flag one visit you remember and use it to learn how your provider lays out the numbers.`,
        sections: [
            {
                heading: "Follow the Balance",
                body_md: `In a simplified fictional statement, $1,200 is available at the start of the period. Funded services use $300 and a credit restores $40. With no other entries, the closing balance would be $940. If yours does not reconcile, check for new funding, adjustments or amounts held separately. Keep participant contributions distinct from amounts deducted from funding.`,
            },
            {
                heading: "Read the Line Descriptions",
                body_md: `Check the date delivered, units and price. For approved personal care from 1 October 2026, the participant share is zero. For ongoing services, care management funding is pooled at branch level. Ask the provider which activities any recorded hours represent. A service description is more useful than a percentage guess.`,
            },
            {
                heading: "When the Person Helping Lives Elsewhere",
                body_md: `Choose one statement and agree how to share it with the person's permission. Record the question, its date and who will follow up. At the next call, ask for the provider's answer before starting a new list. This helps avoid several family members querying the same line while a more important concern waits.`,
            },
        ],
        next_step: {
            invite: "Decode your statement free, then compare the explanation with the line you highlighted.",
            primary: "free_decode",
            secondary: "trial",
        },
        sources: [
            { label: "Official monthly statement requirements", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Pooled care management funding", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["support-at-home-statement-vs-invoice-explained", "support-at-home-statement-flags-what-to-question"],
    },
    {
        slug: "home-care-package-statement-vs-support-at-home-statement",
        title: "Home Care Package Statement vs Support at Home Statement: What Changed",
        excerpt: "Trace the paperwork from your original approval through to the first Support at Home bill. Here is what each document tells you and how to run a family question back to the agreement.",
        published_at: "2026-10-25",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "Home Care Package statement vs Support at Home statement | Wayly",
            description: "Trace the paperwork from your original approval to the first Support at Home bill: what the approval, the service agreement and the statement each tell you.",
        },
        intro_md: `A transition is easier to understand if you can trace the paperwork from approval through to the first bill. Keep your original Home Care Package approval, your current service agreement and a recent Support at Home statement together.`,
        sections: [
            {
                heading: "What Each Document Tells You",
                body_md: `Your approval records a date that may affect contribution protections. The service agreement tells you which services and prices you agreed to. The statement records what was delivered and how funding was used. For the percentage Services Australia assessed, refer to your current fee advice as well.`,
            },
            {
                heading: "If a Family Member Is Helping",
                body_md: `Ask the person receiving care which item they want explained first. It may be as simple as "Why did Tuesday's visit cost more?" Follow that entry back to the agreement. If the documents say CHSP, confirm the program with the provider. CHSP is a separate program with funding extended to 30 June 2029.`,
            },
        ],
        next_step: {
            invite: "Use one free statement decode to put names to the figures before a family conversation.",
            primary: "free_decode",
            secondary: "trial",
        },
        sources: [
            { label: "CHSP extension announcement", href: "https://www.health.gov.au/our-work/commonwealth-home-support-programme-chsp" },
            { label: "Former Home Care Package fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
        ],
        related: ["what-happened-to-my-home-care-package", "support-at-home-statement"],
    },
    {
        slug: "support-at-home-statement-flags-what-to-question",
        title: "What Is Worth Flagging on a Statement and What Is Not",
        excerpt: "A figure is worth checking if you cannot connect it to a service, an agreed price or a previous adjustment. Here is how to tell a likely question from a likely explanation, and how to ask well.",
        published_at: "2026-10-24",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "What is worth flagging on a Support at Home statement | Wayly",
            description: "A figure is worth checking if you cannot connect it to a service, an agreed price or a previous adjustment. How to tell a likely question from a likely explanation, and how to ask well.",
        },
        intro_md: `A figure is worth checking if you cannot connect it to a service, an agreed price or a previous adjustment. You can ask for an explanation while the detail is fresh. A large service cost can still be correct even if your own contribution is small.`,
        sections: [
            {
                heading: "A Likely Question and a Likely Explanation",
                body_md: `Two identical cleaning visits on a day you were away deserve a query. An unusual balance at the start of a quarter may simply reflect funding carried forward. A care management activity entry may differ from last month because your coordination needs changed. None of these entries alone establishes what happened.`,
            },
            {
                heading: "How to Get an Answer You Can Use",
                body_md: `> "On page two my statement shows two cleaning visits on 8 November. I was away that day. Could you check the delivery records and explain whether either line is an adjustment?"

Give the reference and ask where a correction will appear if one is needed. Keep both statements so you can follow the change.`,
            },
        ],
        next_step: {
            invite: "Try a free statement decode to identify the line to ask about and check the original before sending your message.",
            primary: "free_decode",
            secondary: "trial",
        },
        sources: [
            { label: "Official monthly statement requirements", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Pooled care management funding", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["support-at-home-statement", "support-at-home-statement-vs-invoice-explained"],
    },
    {
        slug: "sah-invoice-checker-verify-support-at-home-invoice-five-minutes",
        title: "How to Check a Support at Home Contribution Invoice With Wayly",
        excerpt: "Have your invoice, fee advice and service agreement beside you and follow one line from start to finish. Here is how to use the Invoice Checker as a second reader and frame a precise question.",
        published_at: "2026-10-23",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "How to check a Support at Home invoice with Wayly | Wayly",
            description: "Follow one invoice line from start to finish, use the Invoice Checker as a second reader, and frame a precise question your provider can answer from the visit record.",
        },
        intro_md: `Have the invoice, your fee advice and your service agreement beside you. Pick the amount you are being asked to pay. Your first question is simple: which visits make up that amount?`,
        sections: [
            {
                heading: "Follow One Line From Start to Finish",
                body_md: `Suppose an invoice lists two hours of cleaning and your diary shows one. Check whether two workers attended, whether the invoice combines visits or whether the provider later applied a credit. If the quantity still looks wrong, ask for the visit record and the calculation. Keep the provider's reply with the invoice.`,
            },
            {
                heading: "Use the Checker as a Second Reader",
                body_md: `Open the Invoice Checker during your Wayly trial. Read the suggested questions against the original line items. A flag is a reason to check. For ongoing care management, funding is pooled across a provider branch. A percentage comparison alone cannot establish an overcharge. Ask what activity or allocation the line represents.`,
            },
            {
                heading: "Before Sending a Query",
                body_md: `> "Invoice 104 lists two hours of cleaning on Tuesday. My diary shows one hour. Could you confirm the time recorded and whether the second hour belongs to another visit?"

This gives the provider something specific to check. A tool output can help frame the question, but the original invoice and delivery record carry the detail.`,
            },
        ],
        next_step: {
            invite: "Try the Invoice Checker with one invoice and leave with a specific question you can ask your provider.",
            primary: "invoice_checker",
            secondary: "free_decode",
        },
        sources: [
            { label: "Pooled care management funding", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Official monthly statement requirements", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Wayly tool directory", href: "/ai-tools" },
        ],
        related: ["nine-most-common-support-at-home-invoice-errors", "support-at-home-statement-vs-invoice-explained"],
    },
    {
        slug: "nine-most-common-support-at-home-invoice-errors",
        title: "Nine Things to Check on a Support at Home Invoice",
        excerpt: "If something looks expensive or unfamiliar, check the entries that make up your total before drawing a conclusion. These nine checks help you find a precise question to ask.",
        published_at: "2026-10-22",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        meta: {
            title: "Nine things to check on a Support at Home invoice | Wayly",
            description: "Nine plain-English checks for a Support at Home invoice, from matching the visit and the unit to reconciling credits and the balance, so you can ask a precise question.",
        },
        intro_md: `If something looks expensive or unfamiliar, check the entries that make up your total before drawing a conclusion. Have your calendar, price agreement and fee letter nearby. These nine checks can help you find a precise question to ask.`,
        sections: [
            {
                heading: "Start With the Visit",
                body_md: `1. Is the service yours?
2. Does the delivery date match your calendar?
3. Is the description the service you received?
4. Does the quantity use the right unit, such as hours or visits?
5. If two lines look identical, do they represent different workers, visits or adjustments?`,
            },
            {
                heading: "Then Check the Money",
                body_md: `6. Does the unit price match your agreement for that day?
7. Does the contribution use the right category and effective date?
8. Has a promised credit been applied once?
9. Do the contribution lines, credits and previous balance reconcile to the amount now due?

If one line still looks wrong, request an itemised explanation. Ask what happens to the due date while it is being reviewed.`,
            },
        ],
        next_step: {
            invite: "Bring your invoice into the Wayly trial to turn an unfamiliar entry into a question. Your provider can confirm the underlying visit record.",
            primary: "invoice_checker",
            secondary: "free_decode",
        },
        sources: [
            { label: "How providers set and publish prices", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Official monthly statement requirements", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["sah-invoice-checker-verify-support-at-home-invoice-five-minutes", "support-at-home-statement-vs-invoice-explained"],
    },

    // ---- Batch 3: the Wayly tool guides (verified editorial copy) ----
    {
        slug: "wayly-contribution-estimator-support-at-home-fees",
        title: "Why Your Support at Home Invoice Can Change After a Home Care Package",
        excerpt: "A bigger invoice can come from more visits, a different price, a different mix of services or a change to your assessed contribution. Here is how to narrow down the reason using your last two invoices, your service agreement and your fee letter.",
        published_at: "2026-11-22",
        updated_at: "2026-11-25",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Why your Support at Home invoice can change | Wayly",
            description: "A bigger invoice can come from more visits, a different price, a different service mix or a changed contribution. How to narrow the reason with your invoices, agreement and fee letter.",
        },
        intro_md: `A higher invoice can come from more visits, a different price, a different mix of services or a change to your assessed contribution. You can narrow down the reason with your last two invoices, your service agreement and your fee letter.`,
        sections: [
            {
                heading: "Compare the Same Service Twice",
                body_md: `Suppose cleaning cost $80 per visit in both months and your illustrative rate stayed at 10%. Two visits would cost you $16 and three would cost $24. The extra $8 comes from another visit. If the number of visits stayed the same, check the agreed price and the rate used on the invoice instead.`,
            },
            {
                heading: "Check Whether Transition Protections Apply",
                body_md: `People already receiving a package, or approved and waiting for one by 12 September 2024, have special contribution arrangements. A later transfer into Support at Home alone does not establish which rules apply. Ask Services Australia to confirm your arrangement and ask your provider to explain any price change in writing.`,
            },
            {
                heading: "Ask for the Calculation, Not Just a New Total",
                body_md: `> "On my last invoice I paid $18 for domestic assistance and this month it is $30. Please show me the visits, the unit price and the contribution rate used in each month."

If the unit price changed, ask for the notice or agreement. If the percentage changed, compare the effective date with your latest fee letter.`,
            },
        ],
        next_step: {
            invite: "Try the Contribution Estimator to explore how changing one service affects an estimate. Use your fee letter for your actual rate.",
            primary: "estimator",
            trial: true,
        },
        sources: [
            { label: "Former Home Care Package fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
            { label: "Lifetime caps and changes to contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
        ],
        related: ["wayly-budget-calculator-support-at-home-quarterly-budget", "wayly-provider-price-checker-support-at-home-prices", "support-at-home-costs-and-contributions"],
    },
    {
        slug: "wayly-budget-calculator-support-at-home-quarterly-budget",
        title: "How to Plan a Quarterly Support at Home Budget",
        excerpt: "Start with the quarter and the amount available for services, then test one change at a time. Here is how the two different 10% rules work and how to read a carryover at quarter end.",
        published_at: "2026-11-22",
        updated_at: "2026-11-25",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "How to plan a quarterly Support at Home budget | Wayly",
            description: "Start with the amount available for services, understand the two different 10% rules, and work a carryover example before rearranging the services you need.",
        },
        intro_md: `Begin with the quarter and the amount available for services. If your statement already shows a balance after the care management allocation, use that figure. Deducting the allocation again would make it look as though you have less money available.`,
        sections: [
            {
                heading: "Two Different Uses of 10%",
                body_md: `For ongoing services, 10% of the quarterly budget is allocated to pooled care management. There is a separate rule for carrying unspent ongoing funds into the next quarter. You can carry forward the amount left, up to the higher of $1,000 or 10% of the quarterly budget including supplements. Retained Home Care Package funds are accounted for separately.`,
            },
            {
                heading: "Try Changing the Number of Visits",
                body_md: `Imagine your provider confirms $1,800 is available for services for six weeks. Planned funded spending of $250 per week would use $1,500, leaving $300 before other activity or adjustments. Add a $75 funded visit every week and the projection rises by $450. Ask which planned visits could change before treating a projection as a commitment.`,
            },
            {
                heading: "A Quarter-End Example",
                body_md: `Suppose your ongoing quarterly budget including supplements is $12,000 and $1,350 is unspent. Ten per cent is $1,200, which is higher than $1,000. In this example, up to $1,200 of the remaining ongoing budget carries forward. If only $600 remained, the carryover would be $600. Review the numbers with your provider before rearranging services you need.`,
            },
        ],
        next_step: {
            invite: "Open Wayly's Budget Calculator and test one change to your schedule at a time.",
            primary: "budget_calculator",
            trial: true,
        },
        sources: [
            { label: "Managing quarterly and retained balances", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "Pooled care management funding", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Former Home Care Package fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
        ],
        related: ["wayly-statement-decoder-support-at-home-statement-explained", "wayly-contribution-estimator-support-at-home-fees", "support-at-home-costs-and-contributions"],
    },
    {
        slug: "wayly-provider-price-checker-support-at-home-prices",
        title: "How to Compare Two Provider Prices for the Same Service",
        excerpt: "Ask both providers for the price for the same day, visit length and suburb. A cheaper hourly rate can come with a longer minimum visit, so here is how to compare like for like.",
        published_at: "2026-11-22",
        updated_at: "2026-11-25",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "How to compare two provider prices for the same service | Wayly",
            description: "Ask both providers for the same day, visit length and suburb. A worked comparison, what a price check can and cannot tell you, and why price, availability and continuity differ.",
        },
        intro_md: `Start with a service you actually use. Ask both providers for the price for the same day, visit length and suburb. A cheaper hourly rate may come with a longer minimum visit, which changes the cost of the booking.`,
        sections: [
            {
                heading: "A Worked Comparison",
                body_md: `Imagine Provider A quotes $80 an hour with a two-hour minimum and Provider B quotes $95 for one hour with a one-hour minimum. If you need one hour, the bookings would cost $160 and $95 respectively. Those are illustrative service prices. Your assessed contribution and the amount charged to your budget are separate questions.`,
            },
            {
                heading: "What a Price Check Can Tell You",
                body_md: `Use a published comparison as a starting point. Ask where the reference price came from, what period it covers and whether travel or weekend work changes your quote. A lower price tells you little about whether a worker is available at the time you need. Request the final offer in writing.`,
            },
            {
                heading: "What a Published Comparison Can Miss",
                body_md: `A regional provider may travel farther between clients. One provider may offer a regular worker, while another may be able to cover weekends. Ask each provider how it would deliver the same visit you described. Price, availability and continuity each answer a different part of the choice.`,
            },
        ],
        next_step: {
            invite: "Try the Provider Price Checker with one comparable visit. Take the written quote into your provider conversation.",
            primary: "price_checker",
            trial: true,
        },
        sources: [
            { label: "How providers set and publish prices", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "Government price-cap announcement", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["wayly-statement-decoder-support-at-home-statement-explained", "wayly-contribution-estimator-support-at-home-fees", "what-happened-to-my-home-care-package"],
    },
    {
        slug: "wayly-classification-self-check-support-at-home-levels",
        title: "What to Do When Your Support at Home Classification Feels Too Low",
        excerpt: "The clearest sign your plan needs attention is often something ordinary you can no longer manage. Here is how to record the gap, prepare with a self-check, and do it alongside a parent.",
        published_at: "2026-11-22",
        updated_at: "2026-11-25",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "When your Support at Home classification feels too low | Wayly",
            description: "Start with the gap between your week on paper and the week you lived. Make a short record, use a self-check to prepare, and keep the person's own priorities in any review request.",
        },
        intro_md: `The clearest sign that your plan needs attention may be something ordinary you can no longer manage. Start with the gap between your week on paper and the week you actually experienced. A classification number on its own cannot describe that gap.`,
        sections: [
            {
                heading: "Make a Short Record",
                body_md: `Pick two tasks, such as getting dressed or preparing dinner. Write down how often you needed help, who helped, which days were uncovered and what happened. Describe a typical day as well as a difficult one. Ask the person receiving care which change would make the biggest difference.`,
            },
            {
                heading: "Use a Self-Check to Prepare",
                body_md: `Wayly's Classification Self-Check can help organise a conversation. An aged care assessor decides your official classification. Take specific examples back to your provider or My Aged Care and ask which review is appropriate. Your current decision letter and support plan are the starting documents.`,
            },
            {
                heading: "If You Are Doing This With a Parent",
                body_md: `Read the self-check questions aloud if that helps and let your parent describe their own experience first.

> "I manage the stairs" might mean they do them comfortably, or it might mean they make only one trip a day and avoid going out.

Ask what a normal week looks like. Include the person's own priorities in any request for a review.`,
            },
        ],
        next_step: {
            invite: "Try the Classification Self-Check to prepare a summary you can check in your own words.",
            primary: "classification",
            trial: true,
        },
        sources: [
            { label: "My Aged Care funding tables and contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "When to request a review or reassessment", href: "https://www.myagedcare.gov.au/assessment" },
        ],
        related: ["wayly-reassessment-letter-generator-support-at-home-reassessment", "wayly-care-plan-reviewer-support-at-home-care-plan", "support-at-home-costs-and-contributions"],
    },
];

export const PDF_ARTICLE_OVERRIDES = PDF_ARTICLES_2026.reduce((acc, a) => {
    acc[a.slug] = a;
    return acc;
}, {});
