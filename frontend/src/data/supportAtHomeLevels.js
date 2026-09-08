/**
 * Support at Home classification data, the single source of truth used by:
 *   - the /support-at-home-levels hub page
 *   - the 8 individual /support-at-home-levels/level-N pages
 *   - the Classification Self-Check tool's level-matching logic
 *
 * Annual funding figures are the published Department of Health rates
 * effective 1 November 2025. Indexed each 1 July. Source:
 * https://www.health.gov.au/our-work/support-at-home
 */
export const SUPPORT_AT_HOME_LEVELS = [
    {
        number: 1, slug: "level-1",
        title: "Support at Home Level 1",
        annual: 10731,
        quarterly: 2682.75,
        suits: "Older Australians who are largely independent but need a small amount of regular help to stay safely at home. Often a starting point after the first My Aged Care assessment.",
        services: [
            "About one or two visits a week of personal care, domestic help or social support",
            "Light cleaning, laundry and basic meal preparation",
            "Occasional transport to medical appointments",
            "Allied health check-ins (clinical care is fully government funded)",
        ],
        intro: "Level 1 is the entry classification on Support at Home. It funds enough regular help to keep someone at home safely when their needs are still modest. The annual budget of $10,731 (effective 1 November 2025) is paid as a quarterly budget of roughly $2,683.",
        examples: "A typical Level 1 plan might cover a one-hour cleaner each week, a fortnightly garden tidy, and a social visit. Clinical Care services like nursing or physiotherapy come on top, with no contribution from the participant.",
    },
    {
        number: 2, slug: "level-2",
        title: "Support at Home Level 2",
        annual: 15909.30,
        quarterly: 3977.33,
        suits: "Older Australians who need help most weeks across more than one type of service. Common after a fall, a hospital stay or a change in mobility.",
        services: [
            "Two or three visits a week of personal care or domestic help",
            "Weekly cleaning, laundry and meal preparation",
            "Regular social support or transport",
            "Allied health visits as recommended by the GP",
        ],
        intro: "Level 2 funds steady weekly support and is one of the most common classifications. The annual budget of $15,909.30 (effective 1 November 2025) is paid as a quarterly budget of roughly $3,977.",
        examples: "A typical Level 2 plan covers two short personal-care visits a week, a weekly cleaner and a fortnightly podiatry visit. The quarterly budget gives families enough headroom to add transport during a hospital follow-up.",
    },
    {
        number: 3, slug: "level-3",
        title: "Support at Home Level 3",
        annual: 21965.70,
        quarterly: 5491.43,
        suits: "Older Australians needing daily or near-daily help across multiple service types. Often the right level when family carers can no longer manage the bulk of day-to-day support.",
        services: [
            "Daily or alternate-day personal care visits",
            "Weekly cleaning plus deeper monthly cleans",
            "Regular meal preparation and grocery support",
            "Social support, transport and allied health on a fortnightly to weekly rhythm",
        ],
        intro: "Level 3 is a step up for participants who need help most days. The annual budget of $21,965.70 (effective 1 November 2025) is paid as a quarterly budget of roughly $5,491.",
        examples: "At Level 3 a participant might have a personal-care worker visit five mornings a week, a weekly cleaner, and a fortnightly physiotherapy session. Care management at the standard 10% of the quarterly budget pays for an aged-care coordinator to keep services aligned.",
    },
    {
        number: 4, slug: "level-4",
        title: "Support at Home Level 4",
        annual: 29696.40,
        quarterly: 7424.10,
        suits: "Older Australians with moderate complex needs, including those at risk of falls, with early cognitive change, or recovering from a major health event. Often the level where families start to think about a reassessment.",
        services: [
            "Daily personal care, sometimes with multiple visits a day",
            "Weekly cleaning, laundry, meal preparation and shopping",
            "Regular nursing or allied health support",
            "Assistive technology and home modification budgets carried separately",
        ],
        intro: "Level 4 is the most common classification for participants with moderately complex needs. The annual budget of $29,696.40 (effective 1 November 2025) is paid as a quarterly budget of roughly $7,424.",
        examples: "A typical Level 4 plan funds daily personal care, a weekly cleaner, fortnightly podiatry and physiotherapy, and a quarterly review by an occupational therapist. The Wayly Budget Calculator helps families confirm the plan actually uses the funding rather than leaving an underspend at quarter end.",
    },
    {
        number: 5, slug: "level-5",
        title: "Support at Home Level 5",
        annual: 39620.40,
        quarterly: 9905.10,
        suits: "Older Australians with significant care needs, often including cognitive change, complex medication routines or a higher risk of falls.",
        services: [
            "Multiple personal-care visits a day on most days of the week",
            "Weekly to twice-weekly domestic help",
            "Regular registered-nurse visits for medication or wound care",
            "Allied health, social support and respite to relieve family carers",
        ],
        intro: "Level 5 funds intensive in-home support. The annual budget of $39,620.40 (effective 1 November 2025) is paid as a quarterly budget of roughly $9,905.",
        examples: "At Level 5 a participant might receive morning and evening personal care every day, a weekly registered nurse for medication management, a weekly cleaner and a fortnightly respite block to give a family carer a break.",
    },
    {
        number: 6, slug: "level-6",
        title: "Support at Home Level 6",
        annual: 49544.40,
        quarterly: 12386.10,
        suits: "Older Australians with high care needs and a strong preference to remain at home. Often the right level for participants whose alternative would be considering residential care.",
        services: [
            "Daily personal care across morning and evening routines",
            "Frequent registered-nurse and allied health visits",
            "Weekly domestic help, meal preparation and transport",
            "Significant respite budget to support family carers",
        ],
        intro: "Level 6 funds high-need home support and is paid as a quarterly budget of roughly $12,386 from the annual amount of $49,544.40 (effective 1 November 2025).",
        examples: "A Level 6 plan often funds twice-daily personal care, a weekly registered nurse, fortnightly allied health, a weekly cleaner and a regular respite block. The Wayly Statement Decoder is especially useful at this level because the monthly statement runs to dozens of line items.",
    },
    {
        number: 7, slug: "level-7",
        title: "Support at Home Level 7",
        annual: 63784.80,
        quarterly: 15946.20,
        suits: "Older Australians with very high care needs, including significant cognitive change, advanced frailty, or end-of-life care preferences at home.",
        services: [
            "Multiple personal-care visits a day with overnight check-ins where required",
            "Frequent registered-nurse care",
            "Daily domestic help and meal preparation",
            "Strong allied health, palliative and respite components",
        ],
        intro: "Level 7 is one of the two highest classifications. The annual budget of $63,784.80 (effective 1 November 2025) is paid as a quarterly budget of roughly $15,946.",
        examples: "A Level 7 plan can fund three personal-care visits a day, daily registered-nurse support, a weekly cleaner, regular respite and palliative or end-of-life care services as needed.",
    },
    {
        number: 8, slug: "level-8",
        title: "Support at Home Level 8",
        annual: 78106,
        quarterly: 19526.50,
        suits: "Older Australians with the highest level of care need who choose to remain at home. Typically reserved for participants who would otherwise meet the threshold for permanent residential care.",
        services: [
            "Intensive daily personal-care routines, often multiple visits",
            "Daily clinical-care visits where needed",
            "Comprehensive domestic, meal, transport and respite support",
            "Significant assistive technology and home modification commitments",
        ],
        intro: "Level 8 is the top Support at Home classification. The annual budget of $78,106 (effective 1 November 2025) is paid as a quarterly budget of roughly $19,527.",
        examples: "A Level 8 plan funds round-the-clock practical support short of full residential care. Families at this level often combine the highest budget with significant home modifications funded from the assistive technology and home modifications scheme.",
    },
];

export function levelBySlug(slug) {
    return SUPPORT_AT_HOME_LEVELS.find((l) => l.slug === slug);
}
