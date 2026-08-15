/**
 * CHSP content cluster, pillar + 3 deep-dive articles.
 *
 * One module so the layout, schema emission, key-facts box, contribution
 * table and CTA block are defined once and reused. Each page is a default
 * export so App.js can lazy-route to it.
 */
import React from "react";
import { Link } from "react-router-dom";
import SeoHead from "@/seo/SeoHead";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";

const SITE = "https://wayly.com.au";
const PUBLISHER = {
    "@type": "Organization",
    name: "Wayly",
    logo: { "@type": "ImageObject", url: `${SITE}/branding/png/wayly-lockup-navy-1024.png` },
};
const AUTHOR = { "@type": "Organization", name: "Wayly Editorial", url: `${SITE}/` };

function JsonLd({ data }) {
    return (
        <script
            type="application/ld+json"
            // Schema.org JSON-LD must NOT be HTML-escaped, React's default escaping
            // turns `&` into `&amp;` which breaks JSON. Use dangerouslySetInnerHTML.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
    );
}

function Breadcrumbs({ trail }) {
    return (
        <JsonLd
            data={{
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: trail.map((t, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    name: t.name,
                    item: t.url,
                })),
            }}
        />
    );
}

function ArticleSchema({ headline, description, url, datePublished, image }) {
    return (
        <JsonLd
            data={{
                "@context": "https://schema.org",
                "@type": "Article",
                headline,
                description,
                author: AUTHOR,
                publisher: PUBLISHER,
                datePublished,
                dateModified: datePublished,
                mainEntityOfPage: { "@type": "WebPage", "@id": url },
                image: image || `${SITE}/og-image.png`,
                about: { "@type": "GovernmentService", name: "Commonwealth Home Support Programme" },
            }}
        />
    );
}

function FaqSchema({ items }) {
    return (
        <JsonLd
            data={{
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: items.map(({ q, a }) => ({
                    "@type": "Question",
                    name: q,
                    acceptedAnswer: { "@type": "Answer", text: a },
                })),
            }}
        />
    );
}

function CHSPBanner() {
    return (
        <div className="rounded-md border border-[#E7E0D5] bg-[#F4EFE7] px-4 py-3 text-sm text-[#524B42] mb-6" data-testid="chsp-banner">
            Wayly&apos;s interactive tools (Statement Decoder, Budget Calculator, Contribution Estimator)
            are built for the Support at Home program. CHSP works differently, so the figures on this
            page are general guidance drawn from Australian Government sources. Always confirm fees
            and eligibility with your provider and at{" "}
            <a className="underline text-[#0E4D52]" href="https://www.myagedcare.gov.au/" target="_blank" rel="noopener noreferrer">myagedcare.gov.au</a>.
            CHSP contribution amounts vary by provider.
        </div>
    );
}

function KeyFactsBox({ items }) {
    return (
        <div className="rounded-md border border-[#E7E0D5] bg-[#FBF8F3] px-5 py-4 my-6" data-testid="chsp-key-facts">
            <h3 className="text-base font-semibold text-[#0E4D52] mb-2">Key facts at a glance</h3>
            <ul className="list-disc pl-5 space-y-1 text-[15px] text-[#1C2B2D]">
                {items.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
        </div>
    );
}

function ContributionTable() {
    const rows = [
        ["Domestic assistance", "$7.06 to $13.40"],
        ["Personal care", "$7.06 to $13.40"],
        ["Meals (delivered)", "$4.71 to $13.40 per meal"],
        ["Transport", "$2.35 to $13.50"],
        ["Social support (group)", "$2.35 to $4.50"],
        ["Home maintenance", "$9.41 to $22.30"],
        ["Nursing care", "$4.71 to $11.15"],
        ["Allied health and therapy", "$5.83 to $16.78"],
    ];
    return (
        <div className="overflow-x-auto my-6">
            <table className="w-full min-w-[600px] border border-[#E7E0D5] text-[15px]" data-testid="chsp-contribution-table">
                <caption className="sr-only">CHSP service contribution ranges for 2025-26</caption>
                <thead className="bg-[#0E4D52] text-white">
                    <tr>
                        <th className="text-left px-4 py-2 w-2/5">Service type</th>
                        <th className="text-left px-4 py-2 w-3/5">Typical client contribution (per hour or per service)</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([s, r], i) => (
                        <tr key={s} className={i % 2 ? "bg-[#FBF8F3]" : "bg-white"}>
                            <td className="px-4 py-2 align-top">{s}</td><td className="px-4 py-2 align-top whitespace-nowrap">{r}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ComparisonTable() {
    const rows = [
        ["Best for", "A little help, one or two services", "Ongoing or complex needs, many services"],
        ["Funding model", "Government grants paid to providers", "Individual budget paid quarterly to the person"],
        ["Budget", "No personal budget; pay per service", "One of 8 classifications, from $10,731 to $78,106 a year"],
        ["What you pay", "Small contribution per service, no means test", "Contribution based on income and assets; clinical care is free"],
        ["Assessment", "Single Assessment System via My Aged Care", "Single Assessment System via My Aged Care"],
        ["Flexibility", "Each service is standalone", "Flexible budget, services adjust as needs change"],
        ["Statements", "Per-service fees, set by provider", "Monthly statement showing budget and spending"],
        ["Providers", "Often one provider per service", "Usually one provider managing the plan"],
    ];
    return (
        <div className="overflow-x-auto my-6">
            <table className="w-full min-w-[720px] border border-[#E7E0D5] text-[15px]" data-testid="chsp-comparison-table">
                <thead className="bg-[#0E4D52] text-white">
                    <tr>
                        <th className="text-left px-4 py-2 w-1/5 whitespace-nowrap">Feature</th>
                        <th className="text-left px-4 py-2 w-2/5">CHSP</th>
                        <th className="text-left px-4 py-2 w-2/5">Support at Home</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([f, c, s], i) => (
                        <tr key={f} className={i % 2 ? "bg-[#FBF8F3]" : "bg-white"}>
                            <td className="px-4 py-2 font-medium align-top">{f}</td>
                            <td className="px-4 py-2 align-top">{c}</td>
                            <td className="px-4 py-2 align-top">{s}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function CtaBlock() {
    return (
        <div className="grid sm:grid-cols-3 gap-3 my-8" data-testid="chsp-cta-block">
            <Link to="/ai-tools/aged-care-qa" className="rounded-md bg-[#0E4D52] text-white px-4 py-3 text-center hover:bg-[#091D33]">Ask Wayly a CHSP question</Link>
            <Link to="/ai-tools/classification-self-check" className="rounded-md border border-[#0E4D52] text-[#0E4D52] px-4 py-3 text-center hover:bg-[#F4EFE7]">Classification Self-Check</Link>
            <Link to="/ai-tools/letters-and-follow-ups" className="rounded-md border border-[#0E4D52] text-[#0E4D52] px-4 py-3 text-center hover:bg-[#F4EFE7]">Letters & Follow-ups</Link>
        </div>
    );
}

function Faq({ items, testid }) {
    return (
        <div className="my-6" data-testid={testid}>
            {items.map(({ q, a }) => (
                <div key={q} className="mb-4">
                    <h3 className="font-semibold text-[#0E4D52]">{q}</h3>
                    <p className="text-[15px] text-[#1C2B2D]">{a}</p>
                </div>
            ))}
        </div>
    );
}

const Layout = ({ title, children }) => (
    <div className="min-h-screen bg-surface flex flex-col" data-testid={`chsp-${title}`}>
        <MarketingHeader />
        <main className="flex-1">
            <article className="max-w-5xl mx-auto px-4 py-10 text-[#1C2B2D]">
                {children}
            </article>
        </main>
        <Footer />
    </div>
);

const Meta = ({ published }) => (
    <p className="text-xs text-[#524B42] mb-6">By Wayly Editorial · Published {published} · Last reviewed {published}</p>
);

// ============================================================
// PILLAR
// ============================================================
export function ChspPillar() {
    const url = `${SITE}/chsp/`;
    const title = "Commonwealth Home Support Programme (CHSP) Explained";
    const description = "A plain English guide to the Commonwealth Home Support Programme: what CHSP covers, what it costs, how it differs from Support at Home, and the 2027 change.";
    return (
        <Layout title="pillar">
            <SeoHead title={title} description={description} canonical={url} ogType="article" />
            <ArticleSchema headline={title} description={description} url={url} datePublished="2026-06-04" />
            <Breadcrumbs trail={[{ name: "Home", url: `${SITE}/` }, { name: "CHSP", url }]} />
            <CHSPBanner />
            <h1 className="text-3xl sm:text-4xl font-bold text-[#0E4D52] mb-2">The Commonwealth Home Support Programme (CHSP), Explained for Families</h1>
            <Meta published="4 June 2026" />
            <p className="text-lg leading-relaxed mb-6">The Commonwealth Home Support Programme (CHSP) is Australia&apos;s entry-level home care program. It helps older people who need a bit of help to keep living safely at home. If your parent gets a cleaner, a lift to appointments, or a delivered meal through the government, that is almost certainly CHSP. This page is the short version. Use it to get your bearings, then follow the links to the deeper guides.</p>
            <KeyFactsBox items={[
                "CHSP is for people aged 65 and over, or 50 and over for Aboriginal and Torres Strait Islander people.",
                "It is for lower-level needs. Most people use one or two services.",
                "The government funds providers through grants. Your parent pays a small contribution per service.",
                "There is no income or assets test for CHSP.",
                "In 2024-25, 838,694 people used CHSP through 1,273 providers (ANAO).",
                "CHSP moves into Support at Home no earlier than 1 July 2027. Nothing changes for current clients right now.",
            ]} />
            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">Where to go next</h2>
            <div className="grid sm:grid-cols-3 gap-3">
                <Link to="/chsp/caregiver-guide" className="rounded-md border border-[#E7E0D5] bg-white p-4 hover:border-[#0E4D52]" data-testid="chsp-card-caregiver-guide"><b>Parent on CHSP?</b><br /><span className="text-sm text-[#524B42]">A plain English caregiver guide.</span></Link>
                <Link to="/chsp/vs-support-at-home" className="rounded-md border border-[#E7E0D5] bg-white p-4 hover:border-[#0E4D52]" data-testid="chsp-card-vs-sah"><b>CHSP vs Support at Home</b><br /><span className="text-sm text-[#524B42]">Side by side, plain English.</span></Link>
                <Link to="/chsp/transition-2027" className="rounded-md border border-[#E7E0D5] bg-white p-4 hover:border-[#0E4D52]" data-testid="chsp-card-transition"><b>The 2027 transition</b><br /><span className="text-sm text-[#524B42]">What is known, what is not.</span></Link>
            </div>
            <CtaBlock />
            <p className="text-xs text-[#524B42] mt-6">External references: <a className="underline" href="https://www.myagedcare.gov.au/commonwealth-home-support-program" target="_blank" rel="noopener noreferrer">myagedcare.gov.au</a>, <a className="underline" href="https://www.health.gov.au/our-work/commonwealth-home-support-programme-chsp" target="_blank" rel="noopener noreferrer">health.gov.au</a>.</p>
        </Layout>
    );
}

// ============================================================
// ARTICLE 1, Caregiver Guide
// ============================================================
const FAQ_1 = [
    { q: "Is CHSP free?", a: "No, but it is heavily subsidised. Your parent pays a small contribution per service, often between about $7 and $13 an hour for domestic assistance, and the government pays the rest. Nobody is asked to cover the full cost, and hardship support is available." },
    { q: "Does CHSP look at my parent's income or assets?", a: "No. CHSP has no formal means test. The contribution is set by the provider within national ranges, not by a Centrelink assessment." },
    { q: "Can my parent use more than one provider?", a: "Yes. CHSP clients can use a different provider for each service. Each provider needs its own Service Agreement." },
    { q: "What is the difference between CHSP and a Home Care Package?", a: "Home Care Packages no longer exist for new clients. They were replaced by Support at Home on 1 November 2025. CHSP is the entry level; Support at Home is for higher and ongoing needs." },
    { q: "How do I get my parent more help?", a: "Call My Aged Care on 1800 200 422 and ask for a reassessment, or use Wayly's Letters & Follow-ups to put the request in writing." },
    { q: "Will CHSP disappear in 2027?", a: "CHSP will move into Support at Home no earlier than 1 July 2027. Your parent's current services continue until then, and the government has promised a supported transition." },
];

export function ChspCaregiverGuide() {
    const url = `${SITE}/chsp/caregiver-guide/`;
    const title = "Parent on CHSP? A Plain English Caregiver Guide";
    const description = "Your parent is on CHSP and you feel lost. Here is what CHSP covers, what it costs, and the next steps to take, in plain Australian English.";
    return (
        <Layout title="caregiver-guide">
            <SeoHead title={title} description={description} canonical={url} ogType="article" />
            <ArticleSchema headline="Your Parent Is on CHSP and You Don't Know What to Do: A Plain English Guide" description={description} url={url} datePublished="2026-06-04" />
            <FaqSchema items={FAQ_1} />
            <Breadcrumbs trail={[{ name: "Home", url: `${SITE}/` }, { name: "CHSP", url: `${SITE}/chsp/` }, { name: "Caregiver Guide", url }]} />
            <CHSPBanner />
            <h1 className="text-3xl sm:text-4xl font-bold text-[#0E4D52] mb-2">Your Parent Is on CHSP and You Don&apos;t Know What to Do: A Plain English Guide</h1>
            <Meta published="4 June 2026" />
            <p>Your parent is on the Commonwealth Home Support Programme. A cleaner turns up on a Tuesday, or a van takes them to an appointment, and somewhere there was a letter from My Aged Care that nobody fully read. Now you are the one fielding the calls, and you are not sure what any of it means.</p>
            <p className="mt-3">You are in the right place. This guide explains what CHSP is, what it pays for, what your parent actually pays, and what to do when their needs grow. Plain English, no jargon, no pressure.</p>
            <KeyFactsBox items={[
                "CHSP is Australia's entry-level home care program. It is for people who need a little help, not round-the-clock care.",
                "Your parent qualifies if they are 65 or over, or 50 or over if they are Aboriginal or Torres Strait Islander.",
                "The government pays most of the cost. Your parent pays a small contribution for each service.",
                "There is no income or assets test. Nobody checks your parent's bank account for CHSP.",
                "Your parent can use a different provider for each service.",
                "CHSP will move into the Support at Home program no earlier than 1 July 2027. For now, nothing changes.",
            ]} />
            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">What CHSP actually is</h2>
            <p>CHSP stands for the Commonwealth Home Support Programme. It is the first rung on Australia&apos;s aged care ladder. The idea is simple: give older people a bit of help with the tasks that have become hard, so they can stay in their own home and stay connected to their community.</p>
            <p className="mt-3">The program works on a &quot;doing with you, not for you&quot; approach. It is built around keeping your parent independent, not taking over. That is why most people on CHSP only use one or two services. If your parent needs a lot of coordinated help across many areas of life, that is a different program (Support at Home), and we will come back to that.</p>
            <p className="mt-3">One thing that trips families up: CHSP is funded differently from the newer program. The government gives providers a block of grant money to deliver services in their area. The Government provided $3.1 billion to 1,273 CHSP providers in 2024-25, which the ANAO described as &quot;one of the Australian Government&apos;s largest grants programs.&quot; Your parent does not get a personal budget or a pool of dollars. They get access to specific services, and they pay a small contribution each time they use one.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">The services your parent can get</h2>
            <p>CHSP covers a wide range of everyday help. Your parent will not get all of it. They get what their assessment approved. Here is the full menu so you know what is possible.</p>
            <ul className="list-disc pl-5 mt-3 space-y-1">
                <li><b>Domestic assistance.</b> Help with cleaning, laundry and light household jobs.</li>
                <li><b>Personal care.</b> Help with showering, dressing, grooming and getting around.</li>
                <li><b>Meals.</b> Delivered meals (the service many people still call Meals on Wheels) or help preparing food at home.</li>
                <li><b>Transport.</b> Lifts to medical appointments, shopping and social outings.</li>
                <li><b>Social support.</b> One-on-one visits or group activities to keep your parent connected.</li>
                <li><b>Home maintenance.</b> Minor repairs, gutter cleaning, light gardening to keep the home safe.</li>
                <li><b>Home modifications.</b> Things like grab rails, ramps and non-slip surfaces.</li>
                <li><b>Allied health.</b> Physiotherapy, occupational therapy, podiatry, where a provider offers it.</li>
                <li><b>Nursing.</b> Basic community nursing such as wound care or medication support, in some areas.</li>
                <li><b>Respite.</b> Short breaks for you or whoever is the main carer, at home or at a centre.</li>
            </ul>
            <p className="mt-3">Not every provider offers every service, and availability varies a lot by location. Domestic assistance is the most common service nationally, used by about 40% of CHSP clients (AIHW), so if your parent has a cleaner, they are in good company.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">What your parent pays</h2>
            <p>This is the question every family asks first. The honest answer is &quot;it depends on the provider,&quot; but there are clear guidelines.</p>
            <p className="mt-3">CHSP is not free, but it is cheap, and your parent will never be asked to cover the full cost. Each provider sets its own contributions within national ranges published by the Department of Health, Disability and Ageing. Fees must be agreed in writing in a Service Agreement before services start, and a provider cannot charge more than the actual cost of the service.</p>
            <p className="mt-3">Here are the reasonable contribution ranges for 2025-26, taken from the Department&apos;s CHSP National Unit Price Ranges (Appendix E). These are guides, not fixed prices.</p>
            <ContributionTable />
            <p className="mt-3">Two important points. First, there is no formal means testing. The fee is not based on a Centrelink assessment the way the Age Pension is. Second, if your parent genuinely cannot afford the contribution, they will not be cut off. Every CHSP provider must have a financial hardship policy, and they must publish it. If money is tight, ask the provider for their hardship policy in writing.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">How your parent got on CHSP in the first place</h2>
            <p>Every CHSP client goes through an assessment arranged by My Aged Care, the government&apos;s front door for aged care. You may have heard of the &quot;RAS&quot; (Regional Assessment Service). That name is now history. On 9 December 2024 the government merged RAS and the old ACAT teams into one Single Assessment System, with a single national workforce using one tool. So your parent was assessed once, and the same system can reassess them later if their needs change.</p>
            <p className="mt-3">If your parent has used aged care before, they were almost certainly carried across to the new arrangements automatically. If you are not sure whether they have ever been formally assessed, call their provider, because under the new Aged Care Act 2024 providers can only deliver CHSP to people who have an assessment on record.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">When to ask for more help</h2>
            <p>CHSP is brilliant for &quot;a bit of help.&quot; It is not designed for growing or complex needs. Watch for these signs that your parent has outgrown it:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1">
                <li>They are using two or three CHSP services and still not coping.</li>
                <li>A new diagnosis has changed the picture (for example, dementia, a stroke, a fall).</li>
                <li>You are constantly topping up the gaps yourself.</li>
                <li>A provider has told you there is a waitlist or no capacity for a service they need.</li>
            </ul>
            <p className="mt-3">When that happens, the move is to request a reassessment through My Aged Care. A reassessment can lead to a Support at Home classification, which comes with a proper individual budget and far more flexibility. You do not need a new assessment just because of the 2027 transition. You need one when your parent&apos;s needs increase.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">How Wayly fits in</h2>
            <p>Wayly&apos;s tools are built for the Support at Home program, so they will not decode a CHSP statement line by line yet. What Wayly can do today is help you work out whether your parent is ready to move up, and help you ask for it.</p>
            <p className="mt-3">If you think your parent&apos;s needs have grown, run the <b>Classification Self-Check</b> to see roughly where they might land under Support at Home, then use the <b>Letters & Follow-ups</b> to produce a clear request to My Aged Care, including the new CHSP-to-Support-at-Home variant. And if you just have a question, <b>Ask Wayly</b> now understands CHSP and can point you in the right direction.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">Frequently asked questions</h2>
            <Faq items={FAQ_1} testid="chsp-faq-1" />
            <p className="text-xs italic text-[#524B42]">This article is general information, not financial or care advice. CHSP contribution amounts vary by provider. Always confirm fees with your parent&apos;s provider and check details at myagedcare.gov.au.</p>

            <CtaBlock />
            <p className="text-sm">See also: <Link className="underline text-[#0E4D52]" to="/chsp/">the CHSP pillar</Link>, <Link className="underline text-[#0E4D52]" to="/chsp/vs-support-at-home">CHSP vs Support at Home</Link>, <Link className="underline text-[#0E4D52]" to="/chsp/transition-2027">the 2027 transition</Link>.</p>
        </Layout>
    );
}

// ============================================================
// ARTICLE 2, vs Support at Home
// ============================================================
const FAQ_2 = [
    { q: "Can my parent be on both CHSP and Support at Home?", a: "Usually no. Most people are on one or the other. During the transition period there are limited short-term exceptions, but as a rule your parent will be approved for one program." },
    { q: "Is Support at Home more expensive for my parent?", a: "Not necessarily. Clinical care is free, and contributions for other services depend on income and assets. Full pensioners generally pay the least. CHSP contributions are small but apply to most services." },
    { q: "Does moving to Support at Home mean changing providers?", a: "Not automatically. Your parent can often stay with the same organisation if it delivers Support at Home, or choose a new one." },
    { q: "How many Support at Home levels are there?", a: "Eight ongoing classifications, with annual budgets from $10,731 to $78,106, effective 1 November 2025 and indexed each July." },
    { q: "What replaced the Home Care Package?", a: "Support at Home replaced Home Care Packages and Short-Term Restorative Care on 1 November 2025. CHSP was not part of that change and continues for now." },
    { q: "How do I start a reassessment?", a: "Call My Aged Care on 1800 200 422 or use Wayly's Letters & Follow-ups to put your request in writing." },
];

export function ChspVsSupportAtHome() {
    const url = `${SITE}/chsp/vs-support-at-home/`;
    const title = "CHSP vs Support at Home: Which Does Your Parent Need";
    const description = "A plain English comparison of CHSP and Support at Home, with a side by side table, so you can work out which program suits your parent.";
    return (
        <Layout title="vs-sah">
            <SeoHead title={title} description={description} canonical={url} ogType="article" />
            <ArticleSchema headline="CHSP vs Support at Home: Which Program Does My Parent Actually Need?" description={description} url={url} datePublished="2026-06-11" />
            <FaqSchema items={FAQ_2} />
            <Breadcrumbs trail={[{ name: "Home", url: `${SITE}/` }, { name: "CHSP", url: `${SITE}/chsp/` }, { name: "CHSP vs Support at Home", url }]} />
            <CHSPBanner />
            <h1 className="text-3xl sm:text-4xl font-bold text-[#0E4D52] mb-2">CHSP vs Support at Home: Which Program Does My Parent Actually Need?</h1>
            <Meta published="11 June 2026" />
            <p>If you have been reading about aged care and keep bumping into two names, CHSP and Support at Home, you are not alone. They are both government funded. They both help older people stay at home. But they work very differently, and the one your parent is on decides how much help they can get and how flexible it is.</p>
            <p className="mt-3">This guide puts them side by side, then helps you work out which one fits.</p>
            <KeyFactsBox items={[
                "CHSP is the entry level. It suits people who need one or two services, like cleaning or transport.",
                "Support at Home is for higher or ongoing needs. It gives your parent an individual budget across many service types.",
                "CHSP funds providers with grants. Support at Home funds the person with a quarterly budget.",
                "Both use the same starting point: an assessment through My Aged Care.",
                "Your parent can usually only be on one of them at a time.",
            ]} />
            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">The short version</h2>
            <p>CHSP is a set of individual services you tap into as needed. Support at Home is a full care arrangement: a budget, a care plan, a named provider and a team who knows your parent. If your parent is mostly managing and just needs a hand with a couple of tasks, CHSP is the match. If their needs are growing, complex, or spread across many areas of daily life, Support at Home is built for that.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">Side by side</h2>
            <ComparisonTable />
            <p>The funding figures are the eight ongoing Support at Home classifications, from $10,731.00 (Classification 1) to $78,106.35 (Classification 8), effective 1 November 2025, per the Department of Health, Disability and Ageing factsheet <i>Support at Home program, classifications and budgets</i>. Budgets are paid in four quarterly instalments, and 10% of each quarter is set aside for care management.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">How the money really differs</h2>
            <p>This is the part worth slowing down on, because it explains almost everything else.</p>
            <p className="mt-3">Under CHSP, the government hands providers a grant to deliver services across their region. Your parent does not &quot;have&quot; any money. They have access to services, and they pay a small slice of the cost each time. The upside is simplicity. The downside is that once a provider&apos;s grant is committed to existing clients, they may have little room to take on more, which is why you sometimes hear &quot;there is a waitlist&quot; or &quot;no capacity right now.&quot;</p>
            <p className="mt-3">Under Support at Home, the money follows the person. Your parent is assessed into one of eight classifications, and that comes with a yearly budget split into quarters. They choose how to spend it across approved services, unused funds can roll over (up to $1,000 or 10% of the quarter, whichever is greater), and clinical care like nursing and physiotherapy is fully funded by the government. From 1 October 2026, personal care such as showering and dressing also becomes fully funded under Support at Home, with no contribution. That last change does not apply to CHSP.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">Which one should your parent be on?</h2>
            <p>Use these quick tests.</p>
            <p className="mt-3"><b>Lean CHSP if:</b> your parent is independent most of the time, needs help with one or two specific tasks, and their needs have been stable. A fortnightly clean and a lift to the doctor is a classic CHSP picture.</p>
            <p className="mt-3"><b>Lean Support at Home if:</b> your parent needs help across several areas (personal care plus meals plus nursing, say), their needs are increasing, they have a condition likely to progress, or you are filling a lot of gaps yourself. Robert, who needs help showering, medication reminders, meal preparation and appointments, and whose wife also needs a break, is a Support at Home picture, not a CHSP one.</p>
            <p className="mt-3">One more thing worth knowing. Because CHSP is heading into Support at Home from 2027, and because Support at Home is now the main program, the long-term momentum is with Support at Home. If your parent&apos;s needs are clearly growing, it can make sense to request the reassessment now rather than wait.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">How to move from one to the other</h2>
            <p>If your parent is on CHSP and you think they need more, you do not switch programs yourself. You request a reassessment through My Aged Care on 1800 200 422. A reassessment can approve them for a Support at Home classification. You do not need a reassessment simply because of the 2027 change; you need one when needs increase.</p>
            <p className="mt-3">Wayly can help you get ready. Run the <b>Classification Self-Check</b> to get a feel for where your parent might land, then use the <b>Letters & Follow-ups</b> to write a clear, specific request.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">Frequently asked questions</h2>
            <Faq items={FAQ_2} testid="chsp-faq-2" />
            <p className="text-xs italic text-[#524B42]">This article is general information, not financial or care advice. Funding amounts are indexed annually. Confirm current figures at myagedcare.gov.au.</p>

            <CtaBlock />
            <p className="text-sm">See also: <Link className="underline text-[#0E4D52]" to="/chsp/">the CHSP pillar</Link>, <Link className="underline text-[#0E4D52]" to="/chsp/caregiver-guide">the caregiver guide</Link>, <Link className="underline text-[#0E4D52]" to="/chsp/transition-2027">the 2027 transition</Link>.</p>
        </Layout>
    );
}

// ============================================================
// ARTICLE 3, Transition 2027
// ============================================================
const FAQ_3 = [
    { q: "Will CHSP end in 2027?", a: "CHSP will move into Support at Home no earlier than 1 July 2027, and the date could be later. It is a transition, not a sudden shutdown." },
    { q: "Does my parent have to reapply?", a: "No. The government has said current clients will be supported across, not made to start from scratch. You will get notice and guidance." },
    { q: "Will my parent pay more after the transition?", a: "Possibly, depending on their income and assets. CHSP contributions are small and not means tested. Support at Home contributions are means tested, though clinical care and (from October 2026) personal care are fully funded." },
    { q: "Should we do anything right now?", a: "Only if your parent's needs are growing. In that case, request a reassessment now rather than waiting for 2027." },
    { q: "Why is the transition being delayed?", a: "The government and the sector want more time to get the funding model and contributions right. A Senate inquiry through early 2026 has examined exactly these questions." },
    { q: "Where can I get official updates?", a: "The Department of Health, Disability and Ageing publishes CHSP transition updates at health.gov.au, and My Aged Care at myagedcare.gov.au." },
];

export function ChspTransition2027() {
    const url = `${SITE}/chsp/transition-2027/`;
    const title = "CHSP to Support at Home: What the 2027 Change Means";
    const description = "CHSP moves into Support at Home no earlier than 1 July 2027. Here is what is known, what is not, and what current CHSP recipients should do now.";
    return (
        <Layout title="transition">
            <SeoHead title={title} description={description} canonical={url} ogType="article" />
            <ArticleSchema headline="What the CHSP to Support at Home Transition Means for Your Parent" description={description} url={url} datePublished="2026-06-18" />
            <FaqSchema items={FAQ_3} />
            <Breadcrumbs trail={[{ name: "Home", url: `${SITE}/` }, { name: "CHSP", url: `${SITE}/chsp/` }, { name: "Transition 2027", url }]} />
            <CHSPBanner />
            <h1 className="text-3xl sm:text-4xl font-bold text-[#0E4D52] mb-2">What the CHSP to Support at Home Transition Means for Your Parent</h1>
            <Meta published="18 June 2026" />
            <p>Here is the headline, so you can relax before you read further: nothing changes for your parent right now. The government plans to fold the Commonwealth Home Support Programme into the Support at Home program, but not before 1 July 2027, and possibly later. Your parent&apos;s cleaner, transport and meals keep running under the current rules in the meantime.</p>
            <p className="mt-3">That said, it is worth understanding what is coming, because when the change does happen it will be a genuine shift, not a name swap.</p>
            <KeyFactsBox items={[
                "CHSP will move into Support at Home no earlier than 1 July 2027.",
                "CHSP grant funding has been extended to run until 30 June 2027.",
                "Current CHSP services continue unchanged until the transition.",
                "The biggest change will be moving from grant-funded services to individual budgets.",
                "The government has promised a supported transition, not a sudden switch.",
                "You do not need to do anything now unless your parent's needs are growing.",
            ]} />

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">The timeline, plainly</h2>
            <p>Support at Home started on 1 November 2025 and replaced Home Care Packages and Short-Term Restorative Care. CHSP was deliberately left out of that first stage. The Minister for Aged Care confirmed the program would be delivered in two stages, with CHSP joining &quot;no earlier than 1 July 2027.&quot;</p>
            <p className="mt-3">Note the wording. &quot;No earlier than&quot; is not &quot;on.&quot; This date has already moved more than once over the years, and the phrasing leaves room for it to move again if the sector is not ready. So treat July 2027 as the earliest possible date, not a locked-in one.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">What is known</h2>
            <ul className="list-disc pl-5 mt-3 space-y-1">
                <li><b>Your parent stays on CHSP until the transition.</b> Same services, same provider arrangements, same small contributions.</li>
                <li><b>CHSP is now under the Aged Care Act 2024.</b> Since 1 November 2025, CHSP has been regulated under the new Act, with stronger rights and quality standards. This is a behind-the-scenes change for providers more than a visible change for families.</li>
                <li><b>An assessment is required to stay on CHSP.</b> Under the new Act, providers can only deliver CHSP to people with an assessment on record. Most existing clients were carried across automatically. If you are unsure, check with the provider.</li>
                <li><b>Essential services will continue under the new system.</b> The government has said transport, social support, domestic assistance and meals will still be available after the transition.</li>
            </ul>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">What is still uncertain</h2>
            <p>This is where honesty matters. Several big mechanics have not been settled.</p>
            <ul className="list-disc pl-5 mt-3 space-y-1">
                <li><b>The funding model.</b> CHSP runs on block grants to providers. Support at Home runs on individual budgets. When CHSP transitions, the block-funding model will almost certainly be replaced by individual client budgets. How that conversion works for hundreds of thousands of people is not yet public.</li>
                <li><b>Contributions.</b> CHSP contributions are small and not means tested. Support at Home contributions are based on income and assets. Many CHSP clients currently pay little, so this is the change most likely to affect household budgets, and the detail is not confirmed.</li>
                <li><b>The exact date and the staging.</b> &quot;No earlier than 1 July 2027&quot; leaves the precise timing open.</li>
            </ul>
            <p className="mt-3">There is real scrutiny on all of this. The Senate Community Affairs References Committee is running an <i>Inquiry into the Transition of the CHSP to the Support at Home Program</i> (referred 4 November 2025, with its first hearing on 6 February 2026, and a reporting date extended from 15 April 2026 to 23 June 2026). At the February hearing, the Inspector-General of Aged Care, Natalie Siegel-Brown, warned the transition &quot;lacks clarity&quot; and pointed out that CHSP supports more than half of all aged care clients while making up only about 8% of total aged care spending, which makes it a highly cost-effective prevention program. The Older Persons Advocacy Network (OPAN) told the committee it supports a merger in principle but wants a clear staged timeline, genuine co-design with affected communities, and the affordability of any contribution model fixed before the change.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">Why the shift is bigger than it looks</h2>
            <p>Under CHSP, your parent uses services and pays a small slice. Under Support at Home, the money is attached to your parent as a quarterly budget, clinical care is free, and from 1 October 2026 personal care is free too. That is more flexible, and for many people more generous, but it also introduces income-and-assets-based contributions that CHSP never had. For a full pensioner the move may cost nothing extra. For a self-funded retiree it could mean higher contributions on some services. The point is that the transition is a change in how care is funded and paid for, not just a change of letterhead.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">What to do now</h2>
            <p>For most families, the answer is &quot;stay informed and do nothing yet.&quot; Here is the sensible checklist.</p>
            <ol className="list-decimal pl-5 mt-3 space-y-1">
                <li><b>Keep your parent&apos;s services running.</b> No action needed for the transition itself.</li>
                <li><b>Confirm your parent has an assessment on record.</b> A quick call to the provider settles this.</li>
                <li><b>Watch for growing needs.</b> If your parent&apos;s needs are increasing, you do not have to wait for 2027. Request a reassessment now; it can move them to Support at Home early, with a proper budget.</li>
                <li><b>Keep your parent&apos;s My Aged Care details current</b>, so transition letters reach the right place.</li>
                <li><b>Ask questions as they come up.</b> Ask Wayly understands CHSP and the transition.</li>
            </ol>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">How Wayly helps</h2>
            <p>When the transition does arrive, Wayly is built for exactly the program your parent will be moving into. The <b>Statement Decoder</b>, <b>Budget Calculator</b> and <b>Contribution Estimator</b> all work on Support at Home, so the moment your parent crosses over, the tools apply. In the meantime, if your parent&apos;s needs are growing, use the <b>Classification Self-Check</b> and the <b>Letters & Follow-ups</b> (with its CHSP-to-Support-at-Home variant) to move early rather than wait.</p>

            <h2 className="text-xl font-semibold text-[#0E4D52] mt-8 mb-2">Frequently asked questions</h2>
            <Faq items={FAQ_3} testid="chsp-faq-3" />
            <p className="text-xs italic text-[#524B42]">This article is general information, not financial or care advice. Transition details may change. Check health.gov.au and myagedcare.gov.au for the latest.</p>

            <CtaBlock />
            <p className="text-sm">See also: <Link className="underline text-[#0E4D52]" to="/chsp/">the CHSP pillar</Link>, <Link className="underline text-[#0E4D52]" to="/chsp/caregiver-guide">the caregiver guide</Link>, <Link className="underline text-[#0E4D52]" to="/chsp/vs-support-at-home">CHSP vs Support at Home</Link>.</p>
        </Layout>
    );
}

export default ChspPillar;
