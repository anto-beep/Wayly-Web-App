/**
 * Phase 4 Batch B, Service-specific pages.
 * Eight services that families commonly ask about under Support at Home.
 * Used by /services/<slug> routes via the shared <ContentPage> template.
 *
 * Editorial rules:
 *   - Australian English, no em/en-dashes as sentence breaks.
 *   - Never frame "price caps" or "1 July 2026" as a future event.
 *   - Support at Home replaced Home Care Packages on 1 November 2025.
 *   - Personal care becomes fully government funded on 1 October 2026.
 */
export const SERVICES = [
    {
        slug: "cleaning",
        title: "Cleaning services under Support at Home, what's funded and what's not | Wayly",
        description: "Domestic cleaning is the most common Everyday Living service under Support at Home. See what is funded, typical rates, and what the contribution rules mean for you.",
        h1: "Cleaning services under Support at Home",
        overline: "Service explainer",
        intro: "Domestic cleaning is one of the most used services in Support at Home. It sits in the Everyday Living service stream, which means a participant contribution applies to the published rate. Understanding the rules helps you avoid surprises on your monthly statement and get more out of the quarterly budget.",
        keyTakeaways: [
            "Cleaning is in the Everyday Living service stream and attracts a participant contribution.",
            "Typical rates run roughly 65 to $85 per hour depending on provider and region.",
            "Light domestic help is funded. Spring cleans, gardening, and pet care are not.",
            "From 1 October 2026 personal care moves to fully government funded but cleaning does not change.",
        ],
        sections: [
            {
                heading: "What cleaning under Support at Home covers",
                paragraphs: [
                    "Support at Home funds light domestic help that a participant can no longer manage safely on their own. The intent is to maintain a safe and hygienic home, not to provide a full house service.",
                ],
                bullets: [
                    "Vacuuming, mopping, and dusting in main living areas",
                    "Bathroom and kitchen surface clean",
                    "Changing linen and basic laundry",
                    "Wiping accessible cupboards and reachable windows",
                ],
            },
            {
                heading: "What it does not cover",
                bullets: [
                    "Heavy spring cleans or deep carpet shampooing",
                    "Gardening, mowing, or pruning (these sit under Everyday Living gardening, a separate budget line)",
                    "Pet care, including walking dogs or cleaning pet bedding",
                    "Cleaning rooms not used by the participant, for example a flatmate's space",
                ],
                note: "If your statement shows cleaning rates above the published median or charges for unfunded work, run a free check with the [Provider Price Checker](/ai-tools/provider-price-checker).",
            },
            {
                heading: "How the contribution works",
                paragraphs: [
                    "Cleaning sits in the Everyday Living stream so the participant contributes a share of the published hourly rate. The contribution rate depends on income and assets and is set by Services Australia. A full age pensioner currently contributes 17.5% of the published rate. A part age pensioner contributes 50%. A self funded retiree contributes 80%.",
                    "The government pays the rest from the participant's quarterly budget. If a provider charges above the published rate, the participant pays 100% of the gap, not just the contribution share. That is why brokered cleaners can quietly burn through a quarter's budget faster than expected.",
                ],
            },
            {
                heading: "Tips to make cleaning hours go further",
                bullets: [
                    "Keep the schedule consistent. Same day each week is easier on the participant and the provider.",
                    "Group services where possible. If a personal care worker is in the home, ask whether they can change linen at the end of the visit.",
                    "Track rate creep. Decode each monthly statement and compare the rate per hour over time.",
                    "Use the [Budget Calculator](/ai-tools/budget-calculator) to see how many cleaning hours your classification can support.",
                ],
            },
        ],
        faqs: [
            { q: "Is bond cleaning ever covered?", a: "No. Bond cleans, vacate cleans and end of lease cleans are not funded under Support at Home. They sit outside the program's intent." },
            { q: "Can I top up with private cleaning hours?", a: "Yes. Many households add private hours alongside their funded ones. Private hours do not have to be booked through the registered provider." },
            { q: "Does the provider have to use my parent's own cleaning products?", a: "No. Providers usually supply their own products. If your parent has allergies or strong product preferences, raise this in the care plan so it is recorded." },
            { q: "Can two providers deliver cleaning in the same month?", a: "Generally yes, but only one is the participant's registered provider for Support at Home. A second cleaner would be a private arrangement that you fund directly." },
        ],
        related: [
            { href: "/services/personal-care", label: "Personal care", sub: "Becomes fully government funded on 1 October 2026" },
            { href: "/services/gardening", label: "Gardening", sub: "What it covers and what it does not" },
            { href: "/ai-tools/provider-price-checker", label: "Provider Price Checker", sub: "Compare your hourly rate against the network median" },
            { href: "/ai-tools/budget-calculator", label: "Budget Calculator", sub: "Project your quarterly cleaning capacity" },
        ],
    },
    {
        slug: "gardening",
        title: "Gardening under Support at Home, what's funded for older Australians | Wayly",
        description: "Lawn mowing, hedge trimming, and basic garden maintenance are funded under Support at Home for participants who cannot manage their garden safely. See limits and typical rates.",
        h1: "Gardening under Support at Home",
        overline: "Service explainer",
        intro: "Basic garden maintenance is funded under Support at Home for participants whose garden has become a safety risk. It sits in the Everyday Living stream alongside cleaning. The intent is to keep paths clear and the yard safe to walk around, not to landscape or beautify.",
        keyTakeaways: [
            "Funded under Everyday Living with a participant contribution",
            "Covers mowing, edging, basic pruning, and clearing trip hazards",
            "Does not cover landscaping, tree felling, or new planting",
            "Typical rate runs 70 to $95 per hour depending on region",
        ],
        sections: [
            {
                heading: "What gardening under Support at Home covers",
                bullets: [
                    "Lawn mowing and edging",
                    "Hedge trimming and basic pruning of shrubs the participant can no longer manage",
                    "Clearing leaves and debris from paths, driveways and steps",
                    "Removing rubbish bin to the kerb on collection days",
                ],
            },
            {
                heading: "What it does not cover",
                bullets: [
                    "Landscaping, garden design, or paving",
                    "Tree felling, stump removal, or any work requiring an arborist or licence",
                    "New planting or fertilising",
                    "Lawn and garden equipment purchases",
                ],
                note: "If a major garden risk needs urgent work, ask your care manager about an Assistive Technology and Home Modifications scheme application. Funding can be requested separately to your quarterly budget when the work is reasonable and necessary.",
            },
            {
                heading: "How frequency is decided",
                paragraphs: [
                    "Garden visits are usually fortnightly or monthly. The care plan sets the schedule based on the participant's safety needs and the property size. Higher classifications (Level 4 and above) have more budget to support more frequent visits if the property is large or the garden becomes a falls risk.",
                ],
            },
        ],
        faqs: [
            { q: "Can I use my own gardener instead of the provider's?", a: "Not under Support at Home funding. The registered provider arranges and pays the gardener (subcontracted or in-house). You can always pay a private gardener outside the program if you want a particular person." },
            { q: "What about a hoarding situation?", a: "Hoarding clearance is not funded as a gardening service. Some providers can connect you to specialist clean-up services. The first step is a care plan review with your case manager." },
        ],
        related: [
            { href: "/services/cleaning", label: "Cleaning", sub: "Light domestic help inside the home" },
            { href: "/services/personal-care", label: "Personal care", sub: "Showering, dressing, and daily routines" },
            { href: "/ai-tools/budget-calculator", label: "Budget Calculator", sub: "Project how much your quarterly budget covers" },
        ],
    },
    {
        slug: "transport",
        title: "Transport under Support at Home, appointments, shopping, social outings | Wayly",
        description: "Funded transport under Support at Home covers medical appointments, essential shopping and approved social activities. See what counts as funded transport.",
        h1: "Transport under Support at Home",
        overline: "Service explainer",
        intro: "Transport is one of the most flexible services in Support at Home. It is the Independence stream entry that families ask about most. It can be a paid driver, a taxi voucher style arrangement or community transport through a local council.",
        keyTakeaways: [
            "Sits in the Independence stream with the matching contribution rate",
            "Covers medical, shopping, and approved social trips",
            "Cancellation rules differ by provider and short notice can attract a fee",
            "Charged by the hour, the kilometre, or a flat-rate trip",
        ],
        sections: [
            {
                heading: "What counts as funded transport",
                bullets: [
                    "Trips to medical appointments, including specialist and allied health visits",
                    "Routine grocery and pharmacy runs",
                    "Approved social outings written into the care plan",
                    "Trips to community classes that support wellbeing",
                ],
            },
            {
                heading: "What is not funded",
                bullets: [
                    "Trips to a friend's holiday house or a family wedding (these are private)",
                    "Interstate travel for personal reasons",
                    "Errands the participant could safely manage themselves",
                    "Petrol reimbursement to family members who drive privately",
                ],
                note: "Some statements show short trips charged at a one hour minimum. Decode your statement with the [Statement Decoder](/ai-tools/statement-decoder) to catch this pattern early.",
            },
            {
                heading: "How transport is charged",
                paragraphs: [
                    "Three pricing patterns are common. Per hour billing (e.g. 70 to $95 per hour) including travel, waiting and return. Per kilometre billing on top of a base call out. Flat per trip pricing for predictable routes such as weekly dialysis. Always ask your provider for the rule in writing, including the cancellation policy.",
                ],
            },
        ],
        faqs: [
            { q: "Can my parent be left waiting at the appointment?", a: "Sometimes yes. Most providers stay with the participant unless waiting would exceed a set time. Confirm the rule when you book." },
            { q: "What if my parent uses a wheelchair?", a: "You need a wheelchair accessible vehicle. Not all providers offer them. Ask before booking and check whether the rate is higher." },
        ],
        related: [
            { href: "/services/social-support", label: "Social support", sub: "Companionship and group activities" },
            { href: "/services/personal-care", label: "Personal care", sub: "Daily routines and dignity support" },
            { href: "/ai-tools/statement-decoder", label: "Statement Decoder", sub: "Catch transport pricing surprises" },
        ],
    },
    {
        slug: "meals",
        title: "Meals support under Support at Home, meal prep, delivered meals and shopping | Wayly",
        description: "Meals under Support at Home covers in-home meal preparation, delivered meal services and grocery shopping. See contribution rates and what is not funded.",
        h1: "Meals under Support at Home",
        overline: "Service explainer",
        intro: "Meals sit in the Everyday Living stream. Three patterns are common. A support worker prepares meals in the participant's home. A delivered meals service drops chilled or hot meals daily. A combination of meal prep and shopping support.",
        keyTakeaways: [
            "Everyday Living stream, contribution applies",
            "Three patterns: in-home prep, delivered meals, or hybrid",
            "Special diets must be requested in writing and recorded in the care plan",
            "Cost varies. Delivered meals usually 12 to $18 per meal",
        ],
        sections: [
            {
                heading: "In-home meal preparation",
                paragraphs: [
                    "A support worker shops and cooks in the participant's kitchen. Suits participants who enjoy meal choice, fresh food, and a familiar routine. Usually 60 to 90 minutes per session at a personal care or domestic rate.",
                ],
            },
            {
                heading: "Delivered meals",
                paragraphs: [
                    "Chilled or hot meals delivered by an approved service. Suits participants who prefer minimal household disruption or live alone. Many providers integrate Meals on Wheels style services and charge them to the participant's quarterly budget.",
                ],
            },
            {
                heading: "Hybrid meal support",
                paragraphs: [
                    "A combination of fresh meal prep two or three times a week with delivered meals for the other days. Often the most cost effective approach for participants at Levels 3 and above.",
                ],
                note: "Cultural and religious dietary requirements (halal, kosher, vegetarian, low-FODMAP) must be requested in writing. Most providers can accommodate, but you may need to specify preferred suppliers.",
            },
        ],
        faqs: [
            { q: "Can the support worker do grocery shopping too?", a: "Yes. Grocery shopping is funded under Everyday Living. Combine the trip with meal prep to maximise each visit." },
            { q: "Are restaurant meals or takeaway funded?", a: "No. Funded meals are home prepared or from a contracted meal service. Restaurant meals are private." },
        ],
        related: [
            { href: "/services/cleaning", label: "Cleaning", sub: "Light domestic help in the home" },
            { href: "/services/transport", label: "Transport", sub: "Grocery and appointment trips" },
            { href: "/ai-tools/budget-calculator", label: "Budget Calculator", sub: "Project how meals fit your quarterly budget" },
        ],
    },
    {
        slug: "personal-care",
        title: "Personal care under Support at Home, fully government funded from 1 October 2026 | Wayly",
        description: "Personal care under Support at Home covers showering, dressing, grooming and toileting. From 1 October 2026 it becomes fully government funded for all participants.",
        h1: "Personal care under Support at Home",
        overline: "Service explainer",
        intro: "Personal care is the heart of most Support at Home plans. It is the help with showering, dressing, grooming, and toileting that lets a participant stay safely at home. Personal care currently sits in the Independence stream with a participant contribution. From 1 October 2026 it becomes fully government funded for all participants.",
        keyTakeaways: [
            "Currently in the Independence stream with a participant contribution",
            "Becomes fully government funded on 1 October 2026 (the personal care change)",
            "Covers showering, dressing, grooming, and toileting",
            "Does not cover clinical wound care or registered nurse interventions",
        ],
        sections: [
            {
                heading: "What personal care covers",
                bullets: [
                    "Showering and bathing safely",
                    "Dressing, including help with compression garments and orthotics",
                    "Grooming, shaving, and hair brushing",
                    "Toileting and continence support",
                    "Supervised oral health and denture care",
                ],
            },
            {
                heading: "What it does not cover",
                bullets: [
                    "Wound dressing or any clinical procedure (these are Clinical Care)",
                    "Medication administration (a registered nurse or enrolled nurse task)",
                    "Massage therapy without an allied health referral",
                ],
            },
            {
                heading: "The 1 October 2026 change explained",
                paragraphs: [
                    "Under the Support at Home program, personal care moves to fully government funded on 1 October 2026. From that date the participant contribution rate drops to zero for personal care services. This is a significant change for households where personal care is the largest budget line. Your quarterly statement will reflect this automatically once the change takes effect. You do not need to do anything to opt in.",
                ],
                note: "Until 1 October 2026 the existing contribution rates apply (5% full age pension, 17.5% part age pension, 50% self funded).",
            },
        ],
        faqs: [
            { q: "How does the personal care change affect my budget?", a: "Your quarterly Independence budget will support more hours from October 2026 because personal care no longer reduces the available pool. Use the Budget Calculator from October to project your new capacity." },
            { q: "Will my provider notify me of the change?", a: "Yes. Providers must reflect the new contribution rate on the statement immediately. If your October statement still shows a contribution on personal care lines, raise it with your case manager." },
            { q: "Are private personal care arrangements affected?", a: "No. The change only applies to services delivered through your registered Support at Home provider. Privately paid carers are unchanged." },
        ],
        related: [
            { href: "/policy/personal-care-free-1-october-2026", label: "Personal care policy explainer", sub: "Full detail of the 1 October 2026 change" },
            { href: "/services/nursing", label: "Nursing", sub: "Clinical Care stream, fully government funded" },
            { href: "/ai-tools/contribution-estimator", label: "Contribution Estimator", sub: "See your contribution rate for each service" },
        ],
    },
    {
        slug: "nursing",
        title: "Nursing under Support at Home, fully government funded clinical care | Wayly",
        description: "Nursing services under Support at Home sit in the Clinical Care stream and are fully government funded. See what is included and how to access it.",
        h1: "Nursing under Support at Home",
        overline: "Service explainer",
        intro: "Nursing services sit in the Clinical Care stream of Support at Home. Clinical Care is fully government funded for every participant regardless of classification or financial status. There is no contribution to pay.",
        keyTakeaways: [
            "Clinical Care stream is fully government funded for every participant",
            "Covers wound care, medication management, injections, catheter care",
            "Delivered by registered or enrolled nurses",
            "Falls outside the quarterly Independence and Everyday Living budget",
        ],
        sections: [
            {
                heading: "What nursing covers",
                bullets: [
                    "Wound care and dressings",
                    "Medication management, including blister pack supervision",
                    "Injections including insulin and vitamin supplements",
                    "Catheter and stoma care",
                    "Post hospital care planning and supervision",
                ],
            },
            {
                heading: "How to access nursing under Support at Home",
                paragraphs: [
                    "Nursing must be written into the participant's care plan. A GP referral is helpful but not always required. Your case manager arranges the nurse visit schedule and which Clinical Care provider attends. Nursing visits run from 30 to 90 minutes depending on the task.",
                ],
                note: "If your monthly statement shows charges in the Clinical Care section for items that look more like personal care, run a check with the [Statement Decoder](/ai-tools/statement-decoder).",
            },
        ],
        faqs: [
            { q: "Does my Clinical Care budget have a quarterly cap?", a: "No. Clinical Care is funded outside the participant's quarterly Independence and Everyday Living budget. Each Clinical Care visit is paid directly by the government to the provider." },
            { q: "Can a nurse manage end of life care?", a: "Yes, with the right care plan. Palliative nursing visits, syringe driver management, and symptom support are all funded under Clinical Care." },
        ],
        related: [
            { href: "/services/personal-care", label: "Personal care", sub: "Becomes fully government funded on 1 October 2026" },
            { href: "/services/respite", label: "Respite", sub: "Planned breaks for family carers" },
            { href: "/ai-tools/care-plan-reviewer", label: "Support Plan Reviewer", sub: "Check your care plan is up to date" },
        ],
    },
    {
        slug: "respite",
        title: "Respite under Support at Home, planned breaks for family carers | Wayly",
        description: "Respite under Support at Home gives family carers a planned break. In-home, centre-based and overnight respite are all funded. See how to arrange it.",
        h1: "Respite under Support at Home",
        overline: "Service explainer",
        intro: "Respite is one of the most valuable services for family carers. It is a planned break, ranging from a few hours in the home to multiple nights in a residential setting. Respite reduces carer burnout and helps the household sustain home based care for longer.",
        keyTakeaways: [
            "Funded under Independence with the matching contribution",
            "Three formats: in-home, centre-based, residential overnight",
            "Up to 63 days of residential respite per year is available outside the quarterly budget",
            "Plan in advance. Quality respite providers book out weeks ahead",
        ],
        sections: [
            {
                heading: "Three formats of respite",
                bullets: [
                    "**In-home respite**, a support worker stays with the participant for a few hours while the family carer rests or runs errands",
                    "**Centre-based respite**, the participant attends a day centre with activities and meals while the carer has a longer break",
                    "**Residential respite**, overnight stays from one to several weeks at an aged care facility, often used during illness or family events",
                ],
            },
            {
                heading: "How to plan respite well",
                paragraphs: [
                    "Quality respite is in high demand, especially school holidays and the Christmas period. Talk to your case manager three to six months ahead. Get the participant comfortable with the venue or worker through a short familiarisation visit. Make sure medication and care plans are clearly written for the relief team.",
                ],
                note: "Residential respite is partly funded under a separate scheme outside Support at Home. Your case manager can apply for up to 63 days per year. The 63 days renew each financial year.",
            },
        ],
        faqs: [
            { q: "Is respite ever an emergency option?", a: "Yes. Emergency respite is available when the family carer is unwell, hospitalised, or otherwise unable to provide care. Call your provider or Carer Gateway on 1800 422 737." },
            { q: "Does my parent have to know it is respite?", a: "How it is framed is up to the household. Many families call it a visit or a stay, which can ease the transition." },
        ],
        related: [
            { href: "/services/social-support", label: "Social support", sub: "Daytime companionship and group activities" },
            { href: "/services/personal-care", label: "Personal care", sub: "The bread and butter of in-home support" },
            { href: "/guides/caregiver-guilt", label: "Caregiver guilt", sub: "It is OK to take a break" },
        ],
    },
    {
        slug: "social-support",
        title: "Social support under Support at Home, companionship and groups | Wayly",
        description: "Social support under Support at Home covers companionship visits, social groups and approved community activities. Reduces loneliness and supports wellbeing.",
        h1: "Social support under Support at Home",
        overline: "Service explainer",
        intro: "Social support sits in the Independence stream. The intent is to reduce loneliness and maintain community connections. It covers companionship visits in the home, group activities at a community centre, and approved social outings written into the care plan.",
        keyTakeaways: [
            "Independence stream with the matching contribution rate",
            "Includes companionship, group activities, and social outings",
            "Tied to a wellbeing goal in the care plan",
            "Often the single most underused entitlement in Support at Home",
        ],
        sections: [
            {
                heading: "What social support covers",
                bullets: [
                    "One-to-one companionship visits at home (chat, board games, walks)",
                    "Group activities at a community or day centre",
                    "Approved social outings to the local shops, library, or community events",
                    "Cultural and language specific groups for participants from non-English speaking backgrounds",
                ],
            },
            {
                heading: "Why so few households use it",
                paragraphs: [
                    "Many families do not realise social support is funded. They focus on the practical services (cleaning, personal care, transport) and skip the wellbeing line. A few hours of social support each fortnight can significantly reduce loneliness, improve mood, and reduce the burden on family carers.",
                ],
                note: "If your parent has not had a social support visit in the last three months, raise it at the next care plan review.",
            },
        ],
        faqs: [
            { q: "Can the support worker take my parent shopping just for fun?", a: "Yes, when it is part of a written wellbeing goal. A weekly outing to the local cafe or shopping centre is a perfectly valid social support activity." },
            { q: "What about cultural and language groups?", a: "Many providers offer or refer to language and culture specific groups (Greek, Italian, Cantonese, Vietnamese, Arabic). Ask your case manager." },
        ],
        related: [
            { href: "/services/respite", label: "Respite", sub: "Planned carer breaks" },
            { href: "/services/transport", label: "Transport", sub: "Funded trips to and from activities" },
            { href: "/guides/caring-from-far-away", label: "Caring from far away", sub: "How social support fills the gap" },
        ],
    },
];

export function serviceBySlug(slug) {
    return SERVICES.find((s) => s.slug === slug);
}
