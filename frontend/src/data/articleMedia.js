// Per-article media: a warm lead photo (or on-brand illustration) for every
// structured article, plus optional in-section figures and simple charts.
// Keyed by article slug. Used by the StructuredArticle renderer and the
// Articles index cards. No image bytes are stored here, only URLs.

const u = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

// Warm real photographs (Unsplash / Pexels).
const PHOTO = {
    A3: u("photo-1640654594021-95212ba3459d"),
    A4: "https://images.pexels.com/photos/29372727/pexels-photo-29372727.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    A5: "https://images.pexels.com/photos/233223/pexels-photo-233223.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    B1: u("photo-1758523419018-b3a112f7f770"),
    B2: u("photo-1758691031101-adf06314e289"),
    B3: u("photo-1758691030771-9dadc2a828d4"),
    B4: u("photo-1758691031749-607d43c14f63"),
    B5: "https://images.pexels.com/photos/6975207/pexels-photo-6975207.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    B6: "https://images.pexels.com/photos/7926679/pexels-photo-7926679.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    C1: u("photo-1642043175009-5997b3a078d8"),
    C2: u("photo-1554224155-6726b3ff858f"),
    C3: "https://images.pexels.com/photos/39191075/pexels-photo-39191075.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    C4: u("photo-1626266061368-46a8f578ddd6"),
    C6: "https://images.pexels.com/photos/5900188/pexels-photo-5900188.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    D2: u("photo-1656646523834-dd1cc57d33c9"),
    D3: "https://images.pexels.com/photos/13871327/pexels-photo-13871327.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    E2: u("photo-1758686254545-2e8a33d39adb"),
    E6: "https://images.pexels.com/photos/5810693/pexels-photo-5810693.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    F1: u("photo-1758691462321-9b6c98c40f7e"),
    F2: u("photo-1765896387387-0538bc9f997e"),
    F3: u("photo-1773227055624-07b515ba87c5"),
    F6: "https://images.pexels.com/photos/7345476/pexels-photo-7345476.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    G1: u("photo-1714974528737-3e6c7e4d11af"),
    G4: "https://images.pexels.com/photos/8441820/pexels-photo-8441820.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    G5: u("photo-1780733066519-df99b3123d30"),
    G6: "https://images.pexels.com/photos/8441812/pexels-photo-8441812.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    H2: u("photo-1581573950452-5a438c5f390f"),
    H4: u("photo-1758523670991-ee93bc48d81d"),
};

// On-brand flat illustrations for the abstract / policy articles.
const ILLUS = {
    noWorseOff: "https://static.prod-images.emergentagent.com/jobs/8d74dc1c-0092-4bc2-8a55-b38254dd7592/images/97c7f9d5a7e97992d4b570576bc765e4d6f9fb8a805e34bb424d09e08d7136d3.jpeg",
    chspExtension: "https://static.prod-images.emergentagent.com/jobs/8d74dc1c-0092-4bc2-8a55-b38254dd7592/images/e026843bc10697862d6ebbd28b214e39f7eaeb6b3a4fd9fda924fb249a6fc697.jpeg",
    threeStreams: "https://static.prod-images.emergentagent.com/jobs/8d74dc1c-0092-4bc2-8a55-b38254dd7592/images/cee53c8206b388066572b22bbb4af7941c09cd02f2c405054a4d5c14b0428bf4.jpeg",
    lifetimeCap: "https://static.prod-images.emergentagent.com/jobs/8d74dc1c-0092-4bc2-8a55-b38254dd7592/images/28236c7cd494e3fd423b8ccac2c530102f09288658b8009dbe725954e4c00c5f.jpeg",
    statementFlags: "https://static.prod-images.emergentagent.com/jobs/8d74dc1c-0092-4bc2-8a55-b38254dd7592/images/de6ff329c2f772f12029b0c5cdc8346681ab84f03965370a02513290f8a533ac.jpeg",
    whatChanged: "https://static.prod-images.emergentagent.com/jobs/8d74dc1c-0092-4bc2-8a55-b38254dd7592/images/aae78a7cdaa59a4a7d1d370fda5d8e20265b378d8b50049964db4df285f01dc8.jpeg",
};

// slug -> { src, alt, contain? }  (contain=true keeps illustrations un-cropped)
export const ARTICLE_HERO = {
    // SEO_ARTICLES_2026
    "support-at-home-financial-hardship-assistance": { src: PHOTO.C3, alt: "Older couple going through household finances together at home" },
    "how-to-complain-about-aged-care-commission": { src: PHOTO.G5, alt: "An adviser explaining options to an older couple across a table" },
    "at-hm-scheme-assistive-technology-home-modifications": { src: PHOTO.D3, alt: "An accessible bathroom with grab rails and a step-free shower" },
    "support-at-home-explained": { src: PHOTO.A4, alt: "A home carer helping an older woman move safely around her home" },
    "support-at-home-no-worse-off": { src: ILLUS.noWorseOff, alt: "Illustration of a protective shield over a home", contain: true },
    "chsp-extension-2029-what-it-means": { src: ILLUS.chspExtension, alt: "Illustration of a care program timeline extended to a future date", contain: true },
    "support-at-home-personal-care-free-1-october-2026": { src: PHOTO.B1, alt: "An older man reading a letter at the kitchen table with help" },
    "support-at-home-statement-vs-invoice-explained": { src: PHOTO.B5, alt: "A senior man in glasses reading a document at the kitchen table" },
    "support-at-home-statement": { src: PHOTO.B4, alt: "An older couple reviewing their statement together at home" },
    "home-care-package-vs-support-at-home": { src: PHOTO.G6, alt: "An adviser talking an older couple through their options" },
    "support-at-home-costs-and-contributions": { src: "https://images.pexels.com/photos/6963031/pexels-photo-6963031.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", alt: "An older couple reviewing household bills with a calculator at home" },
    "support-at-home-personal-care-free-october-2026": { src: PHOTO.F2, alt: "A nurse smiling with an older patient during a home visit" },
    "how-much-will-i-pay-for-support-at-home": { src: PHOTO.G4, alt: "A consultant going through the numbers with senior clients" },
    "how-to-switch-support-at-home-provider": { src: PHOTO.H4, alt: "A couple carrying moving boxes into a new home" },
    "support-at-home-vs-home-care-packages-what-changed": { src: ILLUS.whatChanged, alt: "Illustration of a transition from an old scheme to a new one", contain: true },
    "three-streams-clinical-independence-everyday-living": { src: ILLUS.threeStreams, alt: "Illustration of three care funding streams flowing in parallel", contain: true },
    "lifetime-contribution-cap-most-families-do-not-worry": { src: ILLUS.lifetimeCap, alt: "Illustration of rising bars meeting a protective ceiling line", contain: true },
    "switching-support-at-home-provider-practical-playbook": { src: PHOTO.H2, alt: "A couple settling into a new home after a move" },
    "support-at-home-statement-flags-what-to-question": { src: ILLUS.statementFlags, alt: "Illustration of a magnifying glass checking a statement for flags", contain: true },
    "when-to-request-support-at-home-reassessment": { src: PHOTO.F3, alt: "A carer supporting an older woman using a walking frame" },
    "what-happened-to-my-home-care-package": { src: PHOTO.A3, alt: "An older woman sitting thoughtfully in her living room" },
    "home-care-package-levels-support-at-home-classifications": { src: PHOTO.C2, alt: "Hands working through assessment paperwork with a pen and calculator" },
    "home-care-package-statement-vs-support-at-home-statement": { src: PHOTO.B3, alt: "An older man reading a statement on the couch" },
    "will-i-pay-more-under-support-at-home-than-home-care-package": { src: PHOTO.A5, alt: "Close-up of older hands held in reassurance" },

    // SEO_TOOL_ARTICLES
    "wayly-statement-decoder-support-at-home-statement-explained": { src: PHOTO.E2, alt: "An older couple reviewing a statement on a laptop at home" },
    "wayly-budget-calculator-support-at-home-quarterly-budget": { src: PHOTO.C6, alt: "A woman working out a budget with a calculator at home" },
    "wayly-provider-price-checker-support-at-home-prices": { src: PHOTO.C1, alt: "A calculator resting on printed price paperwork" },
    "wayly-classification-self-check-support-at-home-levels": { src: PHOTO.F6, alt: "A health worker checking an older man during a home visit" },
    "wayly-reassessment-letter-generator-support-at-home-reassessment": { src: PHOTO.G1, alt: "People meeting around a table to talk through care options" },
    "wayly-contribution-estimator-support-at-home-fees": { src: PHOTO.C4, alt: "A person estimating costs with a calculator and coffee" },
    "wayly-care-plan-reviewer-support-at-home-care-plan": { src: PHOTO.F1, alt: "A clinician talking through a care plan with an older patient" },
    "wayly-family-coordinator-managing-parents-aged-care": { src: PHOTO.E6, alt: "Three generations of a family together around a laptop" },
    "sah-invoice-checker-verify-support-at-home-invoice-five-minutes": { src: PHOTO.B2, alt: "Older family members going through documents together" },
    "nine-most-common-support-at-home-invoice-errors": { src: "https://images.pexels.com/photos/7651555/pexels-photo-7651555.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", alt: "A hand checking a printed invoice with a pen" },
};

// slug -> { [sectionSlug]: { image?: {src,alt,caption}, chart?: {title,note,items} } }
export const ARTICLE_SECTION_VISUALS = {
    "at-hm-scheme-assistive-technology-home-modifications": {
        "what-is-the-at-hm-scheme": {
            image: { src: PHOTO.D2, alt: "A grab rail fitted beside a toilet", caption: "Grab rails are one of the most common AT-HM funded modifications." },
        },
    },
    "how-much-will-i-pay-for-support-at-home": {
        "work-from-your-fee-advice": {
            image: { src: PHOTO.B5, alt: "A senior reading their fee advice letter at the kitchen table" },
            chart: {
                title: "What a full pensioner contributes, by category (standard arrangements)",
                items: [
                    { label: "Clinical supports", value: 0.4, display: "0%" },
                    { label: "Independence", value: 5, display: "5%" },
                    { label: "Everyday living", value: 17.5, display: "17.5%" },
                ],
                note: "Full-pensioner rates. Other rates depend on your means and fee arrangements; check your fee advice.",
            },
        },
        "estimate-a-familiar-visit": {
            pullquote: { value: "$14", label: "a full pensioner's 17.5% share of an $80 everyday-living visit. Four equivalent visits would total $56." },
        },
    },
    "three-streams-clinical-independence-everyday-living": {
        "clinical-supports-independence-and-everyday-living": {
            chart: {
                title: "What a full pensioner contributes, by category",
                items: [
                    { label: "Clinical supports", value: 0.4, display: "0%" },
                    { label: "Independence (e.g. transport)", value: 5, display: "5%" },
                    { label: "Everyday living (e.g. cleaning)", value: 17.5, display: "17.5%" },
                ],
                note: "Full-pensioner rates. Approved personal care is 0% from 1 October 2026. Check your fee advice for your rates.",
            },
        },
        "a-quick-way-to-read-a-mixed-statement": {
            image: { src: PHOTO.B4, alt: "An older couple reading a mixed statement line by line" },
        },
    },
    "support-at-home-costs-and-contributions": {
        "what-are-the-contribution-rates": {
            chart: {
                title: "Contribution rates by cohort (independence / everyday living)",
                items: [
                    { label: "Full pensioner", value: 17.5, display: "5% / 17.5%" },
                    { label: "Part pensioner", value: 50, display: "up to ~50%" },
                    { label: "Self-funded retiree", value: 80, display: "50% / 80%" },
                ],
                note: "Clinical care is always 0%. Bars reflect the everyday-living share for scale.",
            },
        },
    },
    "lifetime-contribution-cap-most-families-do-not-worry": {
        "which-cap-applies": {
            stats: {
                items: [
                    { value: "$140,652.80", label: "Standard arrangements", sub: "Began on 1 November 2025. Indexed. As at 20 September 2026." },
                    { value: "$88,934.57", label: "No worse off arrangements", sub: "For eligible people. Indexed. As at 20 September 2026." },
                ],
            },
        },
        "how-will-i-know": {
            image: { src: PHOTO.B3, alt: "An older man reading a letter from Services Australia at home" },
        },
    },
    "what-happened-to-my-home-care-package": {
        "where-did-my-package-balance-go": {
            image: { src: PHOTO.C1, alt: "A statement and calculator on a table while checking a package balance" },
        },
    },
    "support-at-home-explained": {
        "before-you-sign-an-agreement": {
            image: { src: PHOTO.G1, alt: "An older person going through a draft service agreement with a trusted helper" },
        },
    },
    "support-at-home-statement-vs-invoice-explained": {
        "how-the-figures-fit-together": {
            pullquote: { value: "$15", label: "what you pay on an illustrative $100 visit. The statement shows the $100 service price; the invoice asks only for your $15 share." },
        },
    },
    "support-at-home-statement": {
        "follow-the-balance": {
            pullquote: { value: "$940", label: "closing balance in the worked example: $1,200 opening, minus $300 of funded services, plus a $40 credit." },
        },
    },
};

// Category-based fallback hero for CMS / legacy articles that are not in
// ARTICLE_HERO, so every card and page still shows a relevant image.
export const CATEGORY_HERO_FALLBACK = {
    "Fees & contributions": { src: PHOTO.C3 },
    "Billing & statements": { src: PHOTO.B5 },
    "Complaints": { src: PHOTO.G5 },
    "Equipment & AT-HM": { src: PHOTO.D3 },
    "Assessment": { src: PHOTO.C2 },
    "Levels & budgets": { src: PHOTO.C6 },
    "Changing provider": { src: PHOTO.H4 },
    "CHSP": { src: ILLUS.chspExtension, contain: true },
    "Home Care Package transition": { src: ILLUS.whatChanged, contain: true },
    "Support at Home basics": { src: PHOTO.A4 },
};

export const DEFAULT_HERO_FALLBACK = { src: "https://images.pexels.com/photos/39191087/pexels-photo-39191087.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" };

// Resolve a hero image for any article (structured, CMS, or legacy static).
export function heroForArticle(article, category) {
    return (
        ARTICLE_HERO[article.slug] ||
        (article.hero_image && { src: article.hero_image }) ||
        (article.cover_image && { src: article.cover_image }) ||
        (article.image && { src: article.image }) ||
        CATEGORY_HERO_FALLBACK[category] ||
        DEFAULT_HERO_FALLBACK
    );
}
