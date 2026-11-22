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
        title: "Wayly Contribution Estimator: What Will You Pay Under Support at Home?",
        excerpt: "An estimate helps when you have a choice to make, like whether to add a cleaning visit. Here is how to change one thing at a time, and what to check if the estimate differs from your invoice.",
        published_at: "2026-11-08",
        updated_at: "2026-11-08",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Wayly Contribution Estimator: what will you pay? | Wayly",
            description: "An estimate helps when you have a choice to make. Change one thing at a time with your provider's quote and fee advice, and check the result against your invoice.",
        },
        intro_md: `An estimate is useful when you have a choice to make, such as whether to add another cleaning visit. Have your provider's quote, the service category and your latest fee advice beside you. Services Australia determines your official contribution rate.`,
        sections: [
            {
                heading: "Change One Thing at a Time",
                body_md: `For a fictional $100 everyday living service at an assumed rate of 17.5%, your contribution would be $17.50. Two identical visits would be $35. Keep the rate and price unchanged first, then vary the number of visits. That makes it easier to see what caused the estimate to move.`,
            },
            {
                heading: "If the Result Differs From Your Invoice",
                body_md: `Check the service date, visit length, category and fee arrangement. Approved personal care delivered from 1 October 2026 has a zero participant contribution. An estimate using a cleaning rate for that service would give the wrong answer. Ask your provider about the classification and Services Australia about the assessed rate.`,
            },
        ],
        next_step: {
            invite: "Try the Contribution Estimator with a real quote before deciding which questions to ask.",
            primary: "estimator",
            trial: true,
        },
        sources: [
            { label: "Official contribution schedules", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["wayly-budget-calculator-support-at-home-quarterly-budget", "wayly-provider-price-checker-support-at-home-prices", "support-at-home-costs-and-contributions"],
    },
    {
        slug: "wayly-budget-calculator-support-at-home-quarterly-budget",
        title: "How to Plan a Quarterly Support at Home Budget",
        excerpt: "Start with the quarter and the amount available for services, then test one change at a time. Here is how the two different 10% rules work and how to read a carryover at quarter end.",
        published_at: "2026-11-08",
        updated_at: "2026-11-08",
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
        published_at: "2026-11-07",
        updated_at: "2026-11-07",
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
        published_at: "2026-11-07",
        updated_at: "2026-11-07",
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

    // ---- Batch 4: transition / switching / reassessment guides (verified editorial copy) ----
    {
        slug: "will-i-pay-more-under-support-at-home-than-home-care-package",
        title: "Will I Pay More Under Support at Home Than My Home Care Package?",
        excerpt: "A bigger invoice can come from more visits, a different price, a different mix of services or a change to your assessed contribution. Here is how to narrow down the reason using your last two invoices, your service agreement and your fee letter.",
        published_at: "2026-11-06",
        updated_at: "2026-11-06",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Will I pay more under Support at Home than my Home Care Package? | Wayly",
            description: "A bigger invoice can come from more visits, a different price, a different service mix or a changed contribution. How to narrow the reason with your invoices, agreement and fee letter.",
        },
        intro_md: `A higher invoice can come from more visits, a different price, a different mix of services or a change to your assessed contribution. You can narrow down the reason with your last two invoices, your service agreement and your fee letter.`,
        sections: [
            { heading: "Compare the Same Service Twice", body_md: `Suppose cleaning cost $80 per visit in both months and your illustrative rate stayed at 10%. Two visits would cost you $16 and three would cost $24. The extra $8 comes from another visit. If the number of visits stayed the same, check the agreed price and the rate used on the invoice instead.` },
            { heading: "Check Whether Transition Protections Apply", body_md: `People already receiving a package, or approved and waiting for one by 12 September 2024, have special contribution arrangements. A later transfer into Support at Home alone does not establish which rules apply. Ask Services Australia to confirm your arrangement and ask your provider to explain any price change in writing.` },
            { heading: "Ask for the Calculation, Not Just a New Total", body_md: `> "On my last invoice I paid $18 for domestic assistance and this month it is $30. Please show me the visits, the unit price and the contribution rate used in each month."

If the unit price changed, ask for the notice or agreement. If the percentage changed, compare the effective date with your latest fee letter.` },
        ],
        next_step: { invite: "Try the Contribution Estimator to explore how changing one service affects an estimate. Use your fee letter for your actual rate.", primary: "estimator", trial: true },
        sources: [
            { label: "Former Home Care Package fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
            { label: "Lifetime caps and changes to contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
        ],
        related: ["how-much-will-i-pay-for-support-at-home", "wayly-contribution-estimator-support-at-home-fees", "support-at-home-no-worse-off"],
    },
    {
        slug: "how-to-switch-support-at-home-provider",
        title: "How to Switch Your Support at Home Provider (Without Losing Your Unspent Funds)",
        excerpt: "Start with the visits you would struggle to miss, then arrange the handover and ask where each balance is held. Here is how to change provider without a gap in care or a lost balance.",
        published_at: "2026-11-06",
        updated_at: "2026-11-06",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "How to switch your Support at Home provider | Wayly",
            description: "Arrange the handover, reactivate your referral code, and ask where each balance is held. The 60-day invoice and 70-day refund timeframes explained in plain English.",
        },
        intro_md: `Start with the visits you would struggle to miss. Before agreeing on an end date, ask the new provider whether it can deliver those services at the times you need and at a price you understand. A provider taking enquiries may still have a waiting list for a particular worker or suburb.`,
        sections: [
            { heading: "Arrange the Handover", body_md: `Check the notice conditions in your agreement. Contact My Aged Care to reactivate your referral code and give it to the new provider. Confirm the last visit with your current provider and the first visit with the new one. Ask both for a named contact if the dates shift. Request a written schedule for essential visits during the change.` },
            { heading: "Ask Where Each Balance Is Held", body_md: `Government-held unspent Home Care Package funds and unspent fees you personally contributed are handled differently. Ask your outgoing provider for an itemised closing statement showing outstanding invoices, funds held by Services Australia and any personal fees to be refunded. Give the incoming provider your latest statement so it can plan while the final balances are settled.` },
            { heading: "What Happens to an Old Package Balance After I Leave?", body_md: `My Aged Care's switching guide distinguishes outstanding claims, Commonwealth-held funds and fees you paid. It allows the outgoing provider 60 days from exit to finalise outstanding service invoices. Unspent participant contributions are repaid within 70 days after services stop. Ask which balance the provider means before treating either timeframe as a deadline for all funds.` },
        ],
        next_step: { invite: "Use the free decoder to read the closing statement, then ask each provider about the entries it is responsible for.", primary: "free_decode", trial: true },
        sources: [
            { label: "Official provider handover guide", href: "https://www.myagedcare.gov.au/changing-your-aged-care-provider" },
        ],
        related: ["wayly-provider-price-checker-support-at-home-prices", "support-at-home-explained", "when-to-request-support-at-home-reassessment"],
    },
    {
        slug: "when-to-request-support-at-home-reassessment",
        title: "When to Ask for a Support Plan Review or Reassessment",
        excerpt: "Moving a visit to a better day may be a scheduling question. Needing daily help with a task you used to manage may call for a review. Here is how to tell the difference and what to take to the call.",
        published_at: "2026-11-08",
        updated_at: "2026-11-08",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "When to ask for a Support at Home review or reassessment | Wayly",
            description: "Tell a scheduling change from a change in your assessed needs, and know what to take to the call: your current plan, a short record of difficult tasks and your contact details.",
        },
        intro_md: `Start by describing the outcome you need. Moving a visit to a better day may be something your provider can arrange within your existing care plan. Needing daily help with a task you previously did alone may call for a review of your assessed needs.`,
        sections: [
            { heading: "Two Conversations You Might Have", body_md: `"My daughter can take me shopping on Friday now. Can we move the visit to Tuesday?" is a scheduling question. "My daughter is no longer able to drive, and I cannot get to appointments" describes a change in available support. Tell your provider or My Aged Care about changes that are affecting your daily life.` },
            { heading: "What to Take to the Call", body_md: `Have your current plan, a short record of missed or difficult tasks and your preferred contact details. Ask what can be adjusted now, whether a support plan review is needed and when you should expect an update. If another change occurs while you wait, report it rather than relying on the original request.` },
        ],
        next_step: { invite: "Use the Classification Self-Check to organise your examples before calling.", primary: "classification", trial: true },
        sources: [
            { label: "When to request a review or reassessment", href: "https://www.myagedcare.gov.au/assessment" },
        ],
        related: ["wayly-classification-self-check-support-at-home-levels", "wayly-reassessment-letter-generator-support-at-home-reassessment", "home-care-package-levels-support-at-home-classifications"],
    },
    {
        slug: "home-care-package-levels-support-at-home-classifications",
        title: "Home Care Package Levels and the New Support at Home Classifications",
        excerpt: "If your letter says \u201cTransitioned HCP Level 3\u201d, keep that whole description. Here is how transitioned levels differ from the eight ongoing classifications, and where to look in the funding tables.",
        published_at: "2026-11-07",
        updated_at: "2026-11-07",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Home Care Package levels and Support at Home classifications | Wayly",
            description: "Why a transitioned HCP level is not the same row as an ongoing classification, what to do if the funding no longer covers your needs, and where to look in the official tables.",
        },
        intro_md: `If your letter says "Transitioned HCP Level 3", keep that whole description when speaking with your provider. The word "transitioned" matters. Support at Home has four classifications for people moving across at an equivalent package level and eight classifications for ongoing funding assessed under the new system.`,
        sections: [
            { heading: "Read the Label Before Comparing Amounts", body_md: `An old Level 3 package maps to the transitioned Level 3 classification. Looking up classification 3 in the eight-level table can give you a different figure. Find the table headed "Transitioned Home Care Package classifications" in the official funding guide. Check the effective date and whether the table shows a quarter or a year.` },
            { heading: "What If the Funding No Longer Covers the Help I Need?", body_md: `Bring your support plan, recent statement and an example of a task you now need help with. Ask what can be changed within your current plan. If your needs have changed, ask about a support plan review. Approval, allocation of funding and the first visit are separate steps. Request the next contact for each.` },
            { heading: "Where to Look in the Funding Tables", body_md: `If the letter names an old Level 1, 2, 3 or 4, look for Transitioned HCP Level 1, 2, 3 or 4 respectively. If it names an ongoing Support at Home classification, use the eight-classification table. For scale, the official table effective 1 October 2026 lists $5,645.23 per quarter for ongoing classification 3. Use the transitioned table if your letter says "Transitioned HCP Level 3". Your statement shows what is actually available after allocations, services and adjustments.` },
        ],
        next_step: { invite: "Use Wayly to prepare a short list of changes you want to discuss at your next care review.", primary: "classification", trial: true },
        sources: [
            { label: "My Aged Care funding tables and contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "When to request a review or reassessment", href: "https://www.myagedcare.gov.au/assessment" },
        ],
        related: ["wayly-classification-self-check-support-at-home-levels", "what-happened-to-my-home-care-package", "support-at-home-explained"],
    },
    {
        slug: "at-hm-scheme-assistive-technology-home-modifications",
        title: "The AT-HM Scheme: How Grab Rails, Ramps and Equipment Are Funded Under Support at Home",
        excerpt: "Equipment and home modifications are funded separately under Support at Home. Here is what the scheme can pay for, which funding figure applies from 1 July 2026, and what to ask before a contractor visits.",
        published_at: "2026-11-19",
        updated_at: "2026-11-19",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "The AT-HM scheme: grab rails, ramps and equipment | Wayly",
            description: "How the Assistive Technology and Home Modifications scheme funds equipment and changes to your home under Support at Home, the funding tiers from 1 July 2026, and what to ask before work begins.",
        },
        intro_md: `If stepping into the shower has become difficult, explain what happens on an ordinary morning. That description helps an assessor understand what you need. Under Support at Home, the Assistive Technology and Home Modifications scheme can provide separate funding for approved equipment or changes to your home.`,
        sections: [
            { heading: "What Could the Scheme Pay For?", body_md: `A shower chair is equipment. A fixed grab rail is a home modification. Your assessment and decision letter record which support you are approved for. Your provider can arrange a qualified professional where a prescription or a home modification assessment is needed. Before ordering anything, ask who must approve the item, organise the work and confirm any contribution.` },
            { heading: "Which Funding Figure Applies?", body_md: `For people commencing from 1 July 2026, the dated My Aged Care costs table lists low funding of $513, medium funding of $2,052 and high funding of $15,390. Higher-cost assistive technology may be available for a prescribed need. Ask for an itemised quote covering assessment, supply, installation and follow-up, then check it against your approval.` },
            { heading: "What to Ask Before a Contractor Visits", body_md: `Before any work is agreed, put your questions in writing.

> "Is my approval for equipment, home modifications or both? Do I need a prescription? What contribution, if any, would I pay? Who will arrange installation and what happens if the quote is higher than the approval?"

The published tiers usually cover 12 months. Complex modifications can qualify for a further 12 months with evidence. Check the date in your decision letter before agreeing to work.` },
        ],
        next_step: {
            invite: "Use free Ask Wayly for a general question about equipment funding. To prepare for a meeting about your own plan, explore the Support Plan Reviewer in the 7-day trial.",
            primary: "ask_wayly",
            secondary: "support_plan_reviewer",
        },
        sources: [
            { label: "Equipment and home modification approvals", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "My Aged Care funding tables and contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
        ],
        related: ["support-at-home-explained", "wayly-care-plan-reviewer-support-at-home-care-plan"],
    },
    {
        slug: "support-at-home-no-worse-off",
        title: "The \u201cNo Worse Off\u201d Rule: What It Means If You Had a Home Care Package",
        excerpt: "The date to look for is 12 September 2024. Here is how the no-worse-off contribution arrangements work, what to check on your invoice, and the separate protection for people approved before 1 July 2014.",
        published_at: "2026-11-18",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "The \u201cNo Worse Off\u201d rule for Home Care Package recipients | Wayly",
            description: "If you had a Home Care Package on 12 September 2024, special contribution arrangements apply under Support at Home. What the rule means, what to check on your invoice, and the pre-July 2014 protection.",
        },
        intro_md: `The date to look for is 12 September 2024. If you were receiving a Home Care Package on that date, or had already been approved and were waiting for a package, special contribution arrangements apply when you move into Support at Home.`,
        sections: [
            { heading: "Two Letters That Sound Similar", body_md: `Imagine Ruth was approved in August 2024 and was still waiting in September. Her first visit was in 2025. Her earlier approval matters. David first applied in August but was only approved in November 2024. An application date alone does not establish the same protection. These examples illustrate the date rule. Your fee advice records the arrangement used for you.` },
            { heading: "What Should I Check on My Invoice?", body_md: `Compare your assessed contribution with the service category and the price you agreed with your provider. Different numbers of visits can change your total even if your fee arrangement stays the same. If dates are missing, ask Services Australia to confirm your approval history and the rates applied.` },
            { heading: "What If I Started Receiving a Package Before July 2014?", body_md: `There is a separate protection for people who were receiving or approved for a Home Care Package before 1 July 2014. My Aged Care treats them as having reached the lifetime contribution cap. If this applies and you are asked to pay, ask what the charge is for and check your circumstances with Services Australia.` },
        ],
        next_step: {
            invite: "Use Wayly to explore an estimate once you know which fee arrangement applies. Keep the official letter for comparison.",
            primary: "estimator",
            trial: true,
        },
        sources: [
            { label: "Former Home Care Package fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
            { label: "Pre-July 2014 fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
        ],
        related: ["what-happened-to-my-home-care-package", "lifetime-contribution-cap-most-families-do-not-worry"],
    },
    {
        slug: "chsp-extension-2029-what-it-means",
        title: "The CHSP Extension to 30 June 2029: What It Means for Older Australians and Their Families",
        excerpt: "Commonwealth Home Support Program grant funding is extended to 30 June 2029. Here is what to expect from your provider, what to do if you now need more help, and three questions for your next call.",
        published_at: "2026-11-18",
        updated_at: "2026-11-18",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "The CHSP extension to 30 June 2029 explained | Wayly",
            description: "The Government extended CHSP grant funding to 30 June 2029. What it means for your own service arrangements, what to do if your needs change, and the questions to ask your provider.",
        },
        intro_md: `The Australian Government has extended Commonwealth Home Support Program grant funding to 30 June 2029. If you receive help with shopping, transport, meals or another entry-level service through CHSP, the announcement concerns the program that funds that help.`,
        sections: [
            { heading: "What Can I Expect From My Provider?", body_md: `Your own service arrangements still matter. Ask whether your visit day, local availability or contribution is changing, and when the provider will tell you about any proposed change. Keep its response with your service agreement. The national extension alone does not tell you which worker will visit or what a particular provider will charge.` },
            { heading: "What If I Now Need More Help?", body_md: `Tell your provider what has changed and ask My Aged Care about a review. Someone who needs several coordinated services may need a fresh assessment. Ask which program you receive before using a fee calculator. A Support at Home contribution estimate is for a different program.` },
            { heading: "Three Questions for Your Next Call", body_md: `Keep the questions short and write the contact name beside each answer.

> "Can you confirm that my service is funded through CHSP? Who will contact me if my service changes? If my current help stops meeting my needs, who can arrange a review?"

If you receive services under different programs, keep the program name beside each service so you know whom to call.` },
        ],
        next_step: {
            invite: "For a general Support at Home question, try free Ask Wayly. If you are discussing a change in your support, Wayly's 7-day trial includes tools for preparing a review request.",
            primary: "ask_wayly",
            secondary: "letters",
        },
        sources: [
            { label: "CHSP extension announcement", href: "https://www.health.gov.au/our-work/commonwealth-home-support-programme-chsp" },
            { label: "When to request a review or reassessment", href: "https://www.myagedcare.gov.au/assessment" },
        ],
        related: ["support-at-home-explained", "when-to-request-support-at-home-reassessment"],
    },
    {
        slug: "support-at-home-personal-care-free-1-october-2026",
        title: "Personal Care Under Support at Home Becomes Free on 1 October 2026: What to Check on Your First Invoice",
        excerpt: "Approved personal care delivered from 1 October 2026 has no participant contribution. Here is how to read across a line before querying it, what to ask your provider, and what a full price on your statement means.",
        published_at: "2026-11-17",
        updated_at: "2026-11-17",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Personal care free from 1 October 2026: check your first invoice | Wayly",
            description: "Approved personal care under Support at Home has no participant contribution from 1 October 2026. How to read your invoice line by line, what to ask your provider, and why a service price is not a charge to you.",
        },
        intro_md: `If you receive approved personal care under Support at Home, you pay no participant contribution for those services delivered from 1 October 2026. Help with showering and dressing are examples. The service still has a price and uses available funding.`,
        sections: [
            { heading: "Read Across the Line Before Querying It", body_md: `In a fictional example, a 12 October shower visit shows a service price of $90 and a participant contribution of $0. Seeing $90 in the service column is expected. If $9 also appears in the amount payable by you, first check whether it belongs to the same visit.` },
            { heading: "What to Ask Your Provider", body_md: `Point to the exact line and keep the question specific.

> "My invoice shows a personal contribution against showering assistance on 12 October. Can you confirm the service type and explain which part, if any, I need to pay?"

If September and October visits appear together, check their delivery dates separately. Keep the response and any adjustment with the original invoice.` },
            { heading: "What If My Statement Still Shows a Full Price?", body_md: `Look for the amount funded and the amount payable by you. A statement can show the price of an approved shower visit because provider time still has a cost. If the participant contribution is zero, the service price alone is no reason to expect a refund. If the paperwork only shows one figure, ask which amount it represents.` },
        ],
        next_step: {
            invite: "Want a second look at the layout? Use Wayly's Invoice Checker during the trial and take any question back to your provider.",
            primary: "invoice_checker",
            trial: true,
        },
        sources: [
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "Official monthly statement requirements", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["support-at-home-personal-care-free-october-2026", "sah-invoice-checker-verify-support-at-home-invoice-five-minutes"],
    },
    {
        slug: "support-at-home-personal-care-free-october-2026",
        title: "Personal Care Becomes Free Under Support at Home From 1 October 2026",
        excerpt: "If cost previously stopped you asking for help with showering or dressing, you can speak to your provider again. Here is what to do if personal care is already approved, and what to say if your needs have changed.",
        published_at: "2026-11-17",
        updated_at: "2026-11-17",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Personal care becomes free from 1 October 2026 | Wayly",
            description: "Approved personal care under Support at Home has no participant contribution from 1 October 2026. What to do if it is already approved and what to say if your needs have changed.",
        },
        intro_md: `If cost previously stopped you asking for help with dressing or showering, you can speak to your provider again. Approved personal care delivered under Support at Home from 1 October 2026 has no participant contribution. Your approval and available budget still determine what can be arranged.`,
        sections: [
            { heading: "If Personal Care Is Already Approved", body_md: `Ask your care partner to show you what another visit would use from your budget each week. Tell them which days matter most and what help you already receive. If the approved service is in your plan, the contribution change alone does not require another assessment.` },
            { heading: "If Your Needs Have Changed", body_md: `Explain the change in everyday terms.

> "I used to manage the shower on weekdays. I now need someone there when I get in and out."

Ask whether a change to your care plan or a support plan review would help. Request the agreed next step and who will contact you.` },
        ],
        next_step: {
            invite: "Use the Budget Calculator during a Wayly trial to explore a different visit pattern before your next care planning conversation.",
            primary: "budget_calculator",
            trial: true,
        },
        sources: [
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
            { label: "When to request a review or reassessment", href: "https://www.myagedcare.gov.au/assessment" },
        ],
        related: ["support-at-home-personal-care-free-1-october-2026", "wayly-budget-calculator-support-at-home-quarterly-budget"],
    },
    {
        slug: "support-at-home-costs-and-contributions",
        title: "What Will Support at Home Actually Cost? A 2026 Guide to Fees and Contributions",
        excerpt: "Choose a typical week and list each visit against the rate from your fee advice. Here is a worked example week, what to do when a monthly total surprises you, and how to compare two provider prices.",
        published_at: "2026-11-16",
        updated_at: "2026-11-16",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "What will Support at Home cost? A 2026 guide to fees | Wayly",
            description: "A practical 2026 guide to Support at Home fees and contributions: a worked example week, what to check when a monthly total surprises you, and how to compare two providers on the same service.",
        },
        intro_md: `Choose a typical week from your calendar. List each visit and its agreed price. Beside it, write the rate from your fee advice for that service category. This gives you a practical way to discuss the week you want with your care partner.`,
        sections: [
            { heading: "An Example Week", body_md: `Imagine one approved nursing visit, one approved shower visit delivered after 1 October 2026 and one $80 cleaning visit. The clinical and personal care visits have no participant contribution. At an illustrative everyday living rate of 17.5%, the cleaning visit contributes $14 to the amount you pay. All three services still have a cost.` },
            { heading: "When a Monthly Total Surprises You", body_md: `Count the actual visits. A month can contain five visits on a weekday you usually count as four. Ask your provider to show its calculation for a shorter visit, a changed service or a credit. If costs are becoming hard to manage, contact Services Australia about hardship assistance.` },
            { heading: "What If Two Providers Charge Different Prices?", body_md: `Ask for quotes for the same work. Compare the day, visit length, minimum booking and total price. An amount quoted per visit may include more time than an amount quoted per hour. Keep the personal contribution and funded share alongside the full price so you can judge both the cost to you and the effect on your care budget.` },
        ],
        next_step: {
            invite: "Start a Wayly trial to model a typical week and compare the estimate with your provider's written quote.",
            primary: "estimator",
            trial: true,
        },
        sources: [
            { label: "My Aged Care funding tables and contributions", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["how-much-will-i-pay-for-support-at-home", "wayly-contribution-estimator-support-at-home-fees"],
    },
    {
        slug: "home-care-package-vs-support-at-home",
        title: "Home Care Package vs Support at Home: What Actually Changed for Your Family",
        excerpt: "When several relatives help, give everyone the same starting point. Here is what to record together, how to resolve conflicting recollections, and why a service can be free to you but still have a price.",
        published_at: "2026-11-15",
        updated_at: "2026-11-15",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Home Care Package vs Support at Home for families | Wayly",
            description: "Support at Home replaced Home Care Packages on 1 November 2025. What families should record together, how to resolve conflicting recollections, and why free-to-you services still show a price.",
        },
        intro_md: `When several relatives help, give everyone the same starting point: the person's preferred routine, the current provider and the date of the last agreement. Support at Home replaced Home Care Packages on 1 November 2025. Old package language can still appear in balances or transitioned classifications.`,
        sections: [
            { heading: "What to Record Together", body_md: `With permission, write down where the approval letter is kept, who checks the monthly statement and who calls if a regular visit changes. Record your family member's preferences about sharing. Someone who arranges transport may only need the time of an appointment.` },
            { heading: "How to Resolve Conflicting Recollections", body_md: `If one person recalls that a service was free, look up the actual service and date. Check what was charged to the budget and what the participant paid. For an approved personal care visit delivered from 1 October 2026, those two amounts can be different even when the participant pays nothing.` },
        ],
        next_step: {
            invite: "Try a free statement decode together. Let the person receiving care choose the first question to take back to the provider.",
            primary: "free_decode",
            trial: true,
        },
        sources: [
            { label: "Former Home Care Package fee arrangements", href: "https://www.servicesaustralia.gov.au/aged-care" },
            { label: "Managing quarterly and retained balances", href: "https://www.myagedcare.gov.au/support-at-home" },
            { label: "Personal care contribution changes", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["what-happened-to-my-home-care-package", "wayly-family-coordinator-managing-parents-aged-care"],
    },
    {
        slug: "support-at-home-vs-home-care-packages-what-changed",
        title: "Support at Home vs Home Care Packages: What Actually Changed",
        excerpt: "Support at Home replaced Home Care Packages on 1 November 2025 and your care moved across. Here is where your package balance went, which fee rules apply, and what to do if a familiar visit has disappeared.",
        published_at: "2026-11-14",
        updated_at: "2026-11-14",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Support at Home vs Home Care Packages: what changed | Wayly",
            description: "Support at Home replaced Home Care Packages on 1 November 2025. Where your package balance went, which fee rules apply to you, and what to do if a familiar visit has disappeared from your schedule.",
        },
        intro_md: `Support at Home is the new program that replaced Home Care Packages on 1 November 2025. If you were receiving a Home Care Package at that time, your care moved across. You did not have to start a new application. Your paperwork now shows a quarterly budget, and your first statement may use different names for services you already know.`,
        sections: [
            { heading: "Where Did My Package Balance Go?", body_md: `Ask your provider to show you three figures separately: your opening Support at Home budget, any unspent Home Care Package funds and what has been used since the change. Different rules apply to money carried across from the old program. A smaller number on the front page may only be one part of the picture.` },
            { heading: "Which Fee Rules Apply to Me?", body_md: `Find your original approval letter. If you were already receiving a package on 12 September 2024, or had approval and were waiting for a package by then, special contribution arrangements apply. Give Services Australia your approval date if your fee advice looks unexpected. Your provider can explain the price of each visit.` },
            { heading: "What to Do If a Familiar Visit Has Disappeared", body_md: `Start with your service agreement and ask your provider to compare the old schedule with the new one.

> "My Thursday domestic assistance used to appear twice a month. I can only see one visit on the new schedule. Is this a change to the plan, a booking still to be made or a difference in how it is recorded?"

Request the answer and the next visit date in writing.` },
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
        related: ["what-happened-to-my-home-care-package", "home-care-package-vs-support-at-home"],
    },
    {
        slug: "switching-support-at-home-provider-practical-playbook",
        title: "Switching Providers: The Practical Playbook",
        excerpt: "A provider can operate in your suburb and still be unable to cover the times you need. Here is what to say to a new provider, what to confirm with your current one, and how to arrange the handover.",
        published_at: "2026-11-13",
        updated_at: "2026-11-13",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Switching Support at Home providers: a practical playbook | Wayly",
            description: "A practical playbook for switching Support at Home providers: what to ask a new provider, what to confirm with your current one, and how to arrange the handover without losing visits.",
        },
        intro_md: `A provider can operate in your suburb and still be unable to cover the times you need. Before you give notice, make a short call to each provider you are considering. Lead with the visit that would be hardest to miss.`,
        sections: [
            { heading: "What to Say to the New Provider", body_md: `Lead with the visit that matters most and ask for the details in writing.

> "I need help getting ready on Mondays and Thursdays before 9 am. Do you have workers available at those times? What is the minimum visit length, what would one visit cost and who would arrange cover if the worker is away? Please send the details and your earliest available start date in writing."` },
            { heading: "What to Confirm With the Current Provider", body_md: `Check your agreement and agree on an end date. Ask for a list of remaining visits, outstanding invoices and the person handling the final statement. Contact My Aged Care about reactivating your referral code. Confirm the last and first visits with both providers before relying on the handover.` },
        ],
        next_step: {
            invite: "Compare the written offers in Wayly's Provider Price Checker during the trial. Keep the appointment times alongside the prices.",
            primary: "price_checker",
            trial: true,
        },
        sources: [
            { label: "Official provider handover guide", href: "https://www.myagedcare.gov.au/changing-your-aged-care-provider" },
            { label: "How providers set and publish prices", href: "https://www.myagedcare.gov.au/support-at-home" },
        ],
        related: ["how-to-switch-support-at-home-provider", "wayly-provider-price-checker-support-at-home-prices"],
    },
    {
        slug: "wayly-statement-decoder-support-at-home-statement-explained",
        title: "Wayly Statement Decoder: How to Read Your Support at Home Statement and Spot Hidden Charges",
        excerpt: "Try the Statement Decoder once every 120 days with no sign-up or card. Here is how to start with one familiar visit, turn a flag into a useful question, and what to do if you have used your free decode.",
        published_at: "2026-11-12",
        updated_at: "2026-11-12",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Wayly Statement Decoder: read your statement and spot charges | Wayly",
            description: "How to use the free Wayly Statement Decoder: start with one familiar visit, turn a flag into a useful question for your provider, and what to do once your free decode is used.",
        },
        intro_md: `You can try the Statement Decoder once every 120 days without signing up or entering a card. Open the tool and choose a statement you are authorised to use. If you would rather practise first, choose the example statement on the tool page.`,
        sections: [
            { heading: "Start With One Familiar Visit", body_md: `Paste the text or use the upload option. Read the plain-English explanation beside the original statement. Find one service you remember and check that its date, units and price match. If a scan is hard to read, check the figures yourself before relying on the explanation.` },
            { heading: "Turn a Flag Into a Useful Question", body_md: `Imagine the original lists a credit but the summary treats it as another charge. Check the sign and the closing balance. Ask your provider:

> "Can you show me how this credit affected the amount available?"

Wayly can help you prepare that question. Your records and your provider's explanation are what settle it.` },
            { heading: "What If I Have Already Used My Free Decode?", body_md: `You can wait until your next free use. You can also read a statement yourself by following the date, service, units, price and contribution across each row. If you want to use Wayly more often or also review invoices, you can choose a separate 7-day trial. Starting that trial requires a card.` },
        ],
        next_step: {
            invite: "Decode one statement free. If you also want to review a contribution invoice or plan a budget, those tools are included in the separate 7-day trial.",
            primary: "free_decode",
            trial: true,
        },
        sources: [
            { label: "Wayly public Statement Decoder", href: "/ai-tools/statement-decoder" },
            { label: "Pooled care management funding", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["support-at-home-statement", "support-at-home-statement-flags-what-to-question"],
    },
    {
        slug: "wayly-reassessment-letter-generator-support-at-home-reassessment",
        title: "Wayly Letters & Follow-Ups: How to Request a Support at Home Reassessment",
        excerpt: "A useful request describes what changed and what you would like someone to do. Here is a letter you can adapt, what to do after you send it, and how to follow up if you have not heard back.",
        published_at: "2026-11-11",
        updated_at: "2026-11-11",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "How to request a Support at Home reassessment: a letter you can adapt | Wayly",
            description: "A plain-English Support at Home reassessment request you can adapt, what to keep after you send it, and how to follow up with your provider or My Aged Care if you have not heard back.",
        },
        intro_md: `A useful request describes what changed and what you would like someone to do. You can make the request yourself or ask someone you trust to help. If writing on another person's behalf, check the wording with them and explain your authority to act.`,
        sections: [
            { heading: "A Letter You Can Adapt", body_md: `Keep it short, specific and in your own words.

> "Hello, I would like my current support arrangements reviewed. Since my partner returned to work in October, I have been managing lunch alone on weekdays. On three days last week I could not prepare a meal. Could we discuss what can change within my current plan and whether I need a support plan review? Please call me in the afternoon and let me know who will follow this up."` },
            { heading: "After You Send It", body_md: `Keep the sent message, the recipient and any reference number. If you follow up, refer to the original date and describe any further change. If you have not heard back, contact the provider or My Aged Care directly. Ask what you can do while you wait.` },
        ],
        next_step: {
            invite: "Use Wayly's letter tool to draft your request, then remove anything that does not sound like you before sending it.",
            primary: "letters",
            trial: true,
        },
        sources: [
            { label: "When to request a review or reassessment", href: "https://www.myagedcare.gov.au/assessment" },
            { label: "Wayly tool directory", href: "/ai-tools" },
        ],
        related: ["when-to-request-support-at-home-reassessment", "wayly-care-plan-reviewer-support-at-home-care-plan"],
    },
    {
        slug: "wayly-care-plan-reviewer-support-at-home-care-plan",
        title: "Wayly Support Plan Reviewer: Does Your Care Plan Match Your Support at Home Level?",
        excerpt: "A useful care plan connects what you want to do with the support you receive. Here is how to read the plan from the participant's side, take one question into the review, and write a one-page meeting note.",
        published_at: "2026-11-10",
        updated_at: "2026-11-10",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Wayly Support Plan Reviewer: does your plan match your level? | Wayly",
            description: "How to review your Support at Home care plan from the participant's side, prepare one question for the review, and bring a one-page meeting note that captures who will follow up and when.",
        },
        intro_md: `A useful care plan connects the things you want to do with the support you receive. Start with one goal that matters to you. "I want to get to choir on Thursday" gives you a better starting point than "I need transport".`,
        sections: [
            { heading: "Read the Plan From the Participant's Side", body_md: `Find the goal, the service intended to support it, when it will happen and who will organise it. If one piece is missing, write a question beside it. For example: "Transport is listed, but choir finishes after 7 pm. Can the service cover the return journey?"` },
            { heading: "Take One Question Into the Review", body_md: `Wayly's Support Plan Reviewer can help you prepare questions about a plan. Check its summary against the original wording. Your assessed classification alone does not establish a particular entitlement to individual services or care management hours. Your provider can explain what is approved, funded and available.` },
            { heading: "A One-Page Meeting Note", body_md: `Write the goal at the top, copy the relevant line from your plan and leave a space for the answer.

> "Goal: attend choir. Current plan: transport to community activities. Question: does the arrangement cover the journey home?"

At the meeting, add who will check, how you will hear back and when you will review the arrangement.` },
        ],
        next_step: {
            invite: "Try the Support Plan Reviewer with one goal in mind. Bring the question that matters most to your next meeting.",
            primary: "support_plan_reviewer",
            trial: true,
        },
        sources: [
            { label: "When to request a review or reassessment", href: "https://www.myagedcare.gov.au/assessment" },
            { label: "Pooled care management funding", href: "https://www.health.gov.au/our-work/support-at-home" },
        ],
        related: ["home-care-package-levels-support-at-home-classifications", "wayly-reassessment-letter-generator-support-at-home-reassessment"],
    },
    {
        slug: "wayly-family-coordinator-managing-parents-aged-care",
        title: "Wayly Family Hub: Managing a Parent's Aged Care as a Family",
        excerpt: "Start with the person receiving care and ask who they want involved. Here is how to try a handover for one appointment, set up sharing together, and make a plan for the first week.",
        published_at: "2026-11-09",
        updated_at: "2026-11-09",
        author: { name: "Wayly Editorial", role: "Wayly" },
        reviewer: { name: "Wayly Editorial", role: "" },
        key_takeaways: [],
        faqs: [],
        howto: null,
        meta: {
            title: "Wayly Family Hub: managing a parent's aged care as a family | Wayly",
            description: "How to coordinate a parent's aged care as a family on Wayly: try a handover for one appointment, set up role-based sharing together, and make a simple plan for the first week.",
        },
        intro_md: `Start with the person receiving care. Ask who they want involved, what each person can see and which decisions they want to make themselves. A family member who drives to appointments may need the visit time without needing access to financial documents.`,
        sections: [
            { heading: "Try a Handover for One Appointment", body_md: `Imagine your mother wants you to check her next invoice and your brother to take her to a review. Ask her permission to record those two jobs. Write down who will act, the date and the one thing each person needs. After the appointment, check with her before passing on new information.` },
            { heading: "Set Up Sharing Together", body_md: `Open the Family plan details and review the roles available. Before inviting anyone, read what that role can view or change. Check the invitation address together. Agree on how you will revisit access if a relative steps back. Sharing inside a family app is separate from authority to speak on someone's behalf with Services Australia or a provider.` },
            { heading: "A Plan for the First Week", body_md: `Choose one shared job, such as preparing for Tuesday's care review. Agree who will read the plan, who will join the meeting and who will record the answer. After the meeting, ask the person receiving care whether the arrangement helped. If it created more noise or shared too much, narrow the task or change who has access.` },
        ],
        next_step: {
            invite: "Explore Wayly Family together and decide whether its sharing options suit the people your family wants involved.",
            primary: "family_hub",
        },
        sources: [
            { label: "Wayly plans and trial pricing", href: "/pricing" },
            { label: "Wayly privacy policy", href: "/legal/privacy" },
        ],
        related: ["home-care-package-vs-support-at-home", "what-happened-to-my-home-care-package"],
    },

];

export const PDF_ARTICLE_OVERRIDES = PDF_ARTICLES_2026.reduce((acc, a) => {
    acc[a.slug] = a;
    return acc;
}, {});
