import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";
import { SUPPORT_AT_HOME_LEVELS } from "@/data/supportAtHomeLevels";
import { ArrowRight, Calculator, ClipboardCheck, FileSearch } from "lucide-react";

/**
 * Support at Home Levels hub — primary landing for the classification cluster.
 * Targets the "support at home levels" keyword family (one of the highest-volume
 * AU aged-care queries). Schemas: CollectionPage + Article + FAQPage + ItemList.
 */
export default function SupportAtHomeLevels() {
    const path = "/support-at-home-levels";
    const itemList = {
        "@type": "ItemList",
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: SUPPORT_AT_HOME_LEVELS.length,
        itemListElement: SUPPORT_AT_HOME_LEVELS.map((l, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            url: `https://wayly.com.au${path}/${l.slug}`,
            name: l.title,
        })),
    };
    const faqs = [
        { q: "How many Support at Home levels are there?", a: "Eight ongoing classifications run from Level 1 to Level 8, with annual funding from $10,731 at Level 1 to $78,106 at Level 8 (effective 1 November 2025). Four extra transitioned levels exist for people who moved across from a Home Care Package." },
        { q: "Who decides which Support at Home level you are on?", a: "An assessor through the Single Assessment System, using the Integrated Assessment Tool. You start the process by calling My Aged Care on 1800 200 422. The assessor visits at home or in hospital, looks at daily tasks, mobility, health and goals, and recommends a classification." },
        { q: "Can my Support at Home level change?", a: "Yes. If needs grow you can request a support plan review through My Aged Care. The Wayly Classification Self-Check helps you decide whether to ask for one, and the Wayly Reassessment Letter Generator drafts the formal request." },
        { q: "Are these levels paid quarterly or annually?", a: "Each level's annual budget is paid as a quarterly budget. You get the full quarter's amount at the start of the quarter, with 10 per cent set aside for care management." },
        { q: "What happens to unspent funding at the end of a quarter?", a: "You can carry over the higher of $1,000 or 10 per cent of the quarterly budget to the next quarter. Anything above that is returned to the system." },
    ];
    const faqLd = {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    };
    const articleLd = {
        "@type": "Article",
        headline: "Support at Home Levels — All 8 Classifications Explained",
        description: "The eight Support at Home classifications and what each funds, with the current annual and quarterly budgets effective 1 November 2025.",
        author: { "@type": "Person", name: "Antony Chiware" },
        publisher: { "@type": "Organization", name: "Wayly", logo: { "@type": "ImageObject", url: "https://wayly.com.au/branding/png/wayly-mark-512.png" } },
        datePublished: "2026-02-05",
        dateModified: "2026-02-05",
        mainEntityOfPage: { "@type": "WebPage", "@id": `https://wayly.com.au${path}` },
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Support at Home Levels — All 8 Classifications Explained · Wayly"
                description="The eight Support at Home classifications side by side. Annual and quarterly funding for Level 1 through Level 8, who each level suits, and how to check yours."
                path={path}
                type="article"
                jsonLd={[articleLd, itemList, faqLd]}
            />
            <MarketingHeader />
            <main className="mx-auto max-w-5xl px-6 py-16">
                <span className="overline">Support at Home</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Support at Home Levels — All 8 Classifications Explained</h1>
                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-k">
                    <span className="text-primary-k font-medium">By Antony Chiware</span>
                    <span>Reviewed by: To be confirmed</span>
                    <span>Published 5 February 2026</span>
                </div>
                <p className="mt-6 text-lg text-muted-k leading-relaxed max-w-3xl">
                    Support at Home has eight ongoing classifications. The level you are on decides the annual funding paid to your provider, which is then split into four quarterly budgets. Higher levels reflect higher care needs and unlock more services, but the contribution rules and the 10 per cent care management cap apply at every level. This guide sets out what each level looks like in practice.
                </p>

                <div className="mt-10 overflow-x-auto rounded-2xl border border-kindred bg-surface" data-testid="levels-table">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surface-2 text-primary-k">
                            <tr>
                                <th className="px-5 py-3 font-heading">Level</th>
                                <th className="px-5 py-3 font-heading">Annual funding</th>
                                <th className="px-5 py-3 font-heading">Quarterly budget</th>
                                <th className="px-5 py-3 font-heading hidden md:table-cell">Who it suits</th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-kindred">
                            {SUPPORT_AT_HOME_LEVELS.map((l) => (
                                <tr key={l.slug} data-testid={`row-${l.slug}`}>
                                    <td className="px-5 py-4 font-medium text-primary-k">Level {l.number}</td>
                                    <td className="px-5 py-4 tabular-nums">${l.annual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="px-5 py-4 tabular-nums">${l.quarterly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="px-5 py-4 text-muted-k hidden md:table-cell">{l.suits.split(".")[0]}.</td>
                                    <td className="px-5 py-4 text-right">
                                        <Link to={`${path}/${l.slug}`} className="text-primary-k underline inline-flex items-center gap-1">View <ArrowRight className="h-3 w-3" /></Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-12 grid sm:grid-cols-3 gap-4">
                    <Link to="/ai-tools/classification-self-check" className="bg-surface border border-kindred rounded-2xl p-5 hover:border-primary-k transition-colors" data-testid="link-classification-tool">
                        <ClipboardCheck className="h-5 w-5 text-primary-k" />
                        <div className="font-heading text-lg text-primary-k mt-2">Classification Self-Check</div>
                        <div className="text-sm text-muted-k mt-1">Seven questions to see if your parent's level still matches their needs.</div>
                    </Link>
                    <Link to="/ai-tools/budget-calculator" className="bg-surface border border-kindred rounded-2xl p-5 hover:border-primary-k transition-colors" data-testid="link-budget-tool">
                        <Calculator className="h-5 w-5 text-primary-k" />
                        <div className="font-heading text-lg text-primary-k mt-2">Budget Calculator</div>
                        <div className="text-sm text-muted-k mt-1">See how your quarterly budget is being spent across the three streams.</div>
                    </Link>
                    <Link to="/ai-tools/statement-decoder" className="bg-surface border border-kindred rounded-2xl p-5 hover:border-primary-k transition-colors" data-testid="link-decoder-tool">
                        <FileSearch className="h-5 w-5 text-primary-k" />
                        <div className="font-heading text-lg text-primary-k mt-2">Statement Decoder</div>
                        <div className="text-sm text-muted-k mt-1">Upload a monthly statement and Wayly flags anomalies in plain English.</div>
                    </Link>
                </div>

                <section className="mt-14" data-testid="hub-faqs">
                    <h2 className="font-heading text-2xl text-primary-k tracking-tight">Frequently asked questions</h2>
                    <div className="mt-5 space-y-4">
                        {faqs.map((f) => (
                            <div key={f.q} className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="font-heading text-base text-primary-k">{f.q}</div>
                                <p className="text-sm text-muted-k mt-2 leading-relaxed">{f.a}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-14" data-testid="hub-related">
                    <h2 className="font-heading text-xl text-primary-k tracking-tight">Related guides</h2>
                    <ul className="mt-3 space-y-2 text-sm">
                        <li><Link className="text-primary-k underline" to="/resources/articles/wayly-classification-self-check-support-at-home-levels">Wayly Classification Self-Check</Link></li>
                        <li><Link className="text-primary-k underline" to="/resources/articles/wayly-budget-calculator-support-at-home-quarterly-budget">Wayly Budget Calculator: how the quarterly budget works</Link></li>
                        <li><Link className="text-primary-k underline" to="/resources/articles/support-at-home-costs-and-contributions">Support at Home costs and contributions</Link></li>
                    </ul>
                </section>

                <footer className="mt-12 pt-6 border-t border-kindred text-xs text-muted-k space-y-1" data-testid="hub-trust-footer">
                    <p>Last reviewed: 5 February 2026 · Reviewed by: To be confirmed</p>
                    <p>Sources: <a href="https://www.health.gov.au/our-work/support-at-home" className="underline" rel="noopener">health.gov.au — Support at Home</a> · <a href="https://www.myagedcare.gov.au/support-at-home" className="underline" rel="noopener">myagedcare.gov.au</a>. If you find an error, email <a href="mailto:hello@wayly.com.au" className="underline">hello@wayly.com.au</a>.</p>
                </footer>
            </main>
            <Footer />
        </div>
    );
}
