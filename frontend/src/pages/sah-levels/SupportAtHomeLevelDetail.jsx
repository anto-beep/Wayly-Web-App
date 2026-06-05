import React from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";
import { SUPPORT_AT_HOME_LEVELS, levelBySlug } from "@/data/supportAtHomeLevels";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Calculator, FileSearch, FilePen } from "lucide-react";

/**
 * Single Support at Home level detail page. One component, eight URLs:
 * /support-at-home-levels/level-1 through /level-8. Each page targets a
 * specific keyword in the cluster ("support at home level 4" etc).
 *
 * Schema set per page:
 *   - Article (datePublished, author Antony Chiware)
 *   - FAQPage (3 level-specific Q+A)
 *   - BreadcrumbList (Home → Support at Home Levels → Level N)
 *   - Sitewide Organization + WebSite emit automatically via SeoHead
 */
export default function SupportAtHomeLevelDetail() {
    const { slug } = useParams();
    const level = levelBySlug(slug);
    if (!level) return <Navigate to="/support-at-home-levels" replace />;

    const path = `/support-at-home-levels/${level.slug}`;
    const url = `https://wayly.com.au${path}`;

    const next = SUPPORT_AT_HOME_LEVELS[level.number] || null;
    const prev = SUPPORT_AT_HOME_LEVELS[level.number - 2] || null;

    const faqs = [
        { q: `Who is Support at Home Level ${level.number} for?`, a: level.suits },
        { q: `How much funding does Support at Home Level ${level.number} provide?`, a: `Support at Home Level ${level.number} provides $${level.annual.toLocaleString()} per year, effective 1 November 2025. That is paid as a quarterly budget of roughly $${Math.round(level.quarterly).toLocaleString()}, with 10 per cent of each quarter set aside for care management.` },
        { q: `How do I move to a higher Support at Home level?`, a: "Request a support plan review through My Aged Care on 1800 200 422. The Wayly Classification Self-Check helps you decide if a review is worth requesting, and the Wayly Reassessment Letter Generator drafts the formal letter to send." },
    ];
    const faqLd = {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    };
    const articleLd = {
        "@type": "Article",
        headline: `Support at Home Level ${level.number}: Funding, Services and Who It Suits`,
        description: `Support at Home Level ${level.number} explained: $${level.annual.toLocaleString()} a year (effective 1 November 2025), who it suits and what services it typically funds.`,
        author: { "@type": "Person", name: "Antony Chiware" },
        publisher: { "@type": "Organization", name: "Wayly", logo: { "@type": "ImageObject", url: "https://wayly.com.au/branding/png/wayly-mark-512.png" } },
        datePublished: "2026-02-05",
        dateModified: "2026-02-05",
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
    };
    const breadcrumbLd = {
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://wayly.com.au/" },
            { "@type": "ListItem", position: 2, name: "Support at Home Levels", item: "https://wayly.com.au/support-at-home-levels" },
            { "@type": "ListItem", position: 3, name: `Level ${level.number}`, item: url },
        ],
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title={`Support at Home Level ${level.number}: $${level.annual.toLocaleString()}/year · Wayly`}
                description={`Support at Home Level ${level.number} explained: $${level.annual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a year (effective 1 November 2025), who it suits and what services it funds. Plain English, with current figures from health.gov.au.`}
                path={path}
                type="article"
                jsonLd={[articleLd, faqLd, breadcrumbLd]}
            />
            <MarketingHeader />
            <main className="mx-auto max-w-3xl px-6 py-16">
                <Link to="/support-at-home-levels" className="text-xs text-muted-k inline-flex items-center gap-1 mb-4" data-testid="breadcrumb-back"><ArrowLeft className="h-3 w-3" /> All Support at Home levels</Link>

                <span className="overline">Support at Home · Level {level.number}</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">{level.title}: funding, services and who it suits</h1>
                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-k" data-testid={`meta-${level.slug}`}>
                    <span className="text-primary-k font-medium">By Antony Chiware</span>
                    <span>Reviewed by: To be confirmed</span>
                    <span>Published 5 February 2026</span>
                </div>

                <div className="mt-8 grid sm:grid-cols-2 gap-4">
                    <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="annual-card">
                        <div className="overline">Annual funding</div>
                        <div className="font-heading text-3xl text-primary-k mt-2 tabular-nums">${level.annual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-muted-k mt-1">Effective 1 November 2025. Indexed each 1 July.</div>
                    </div>
                    <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="quarterly-card">
                        <div className="overline">Quarterly budget</div>
                        <div className="font-heading text-3xl text-primary-k mt-2 tabular-nums">${level.quarterly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-xs text-muted-k mt-1">10 per cent of this quarter goes to care management.</div>
                    </div>
                </div>

                <section className="mt-10">
                    <p className="text-lg text-muted-k leading-relaxed">{level.intro}</p>
                </section>

                <section className="mt-10">
                    <h2 className="font-heading text-2xl text-primary-k tracking-tight">Who Support at Home Level {level.number} suits</h2>
                    <p className="mt-3 text-muted-k leading-relaxed">{level.suits}</p>
                </section>

                <section className="mt-10">
                    <h2 className="font-heading text-2xl text-primary-k tracking-tight">What services Level {level.number} typically funds</h2>
                    <ul className="mt-4 space-y-3">
                        {level.services.map((s) => (
                            <li key={s} className="flex items-start gap-3 text-muted-k">
                                <CheckCircle2 className="h-5 w-5 text-primary-k mt-0.5 flex-shrink-0" />
                                <span>{s}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-5 text-muted-k leading-relaxed">{level.examples}</p>
                </section>

                <section className="mt-10 bg-surface border border-kindred rounded-2xl p-6" data-testid="tools-cta">
                    <h2 className="font-heading text-xl text-primary-k tracking-tight">Check whether Level {level.number} still fits</h2>
                    <p className="mt-2 text-sm text-muted-k">Needs change. If your parent's care plan keeps running short or family is filling more gaps than a year ago, it may be time to review the level.</p>
                    <div className="mt-4 grid sm:grid-cols-3 gap-3">
                        <Link to="/ai-tools/classification-self-check" className="text-sm inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-4 py-2"><ClipboardCheck className="h-4 w-4" /> Run the self-check</Link>
                        <Link to="/ai-tools/budget-calculator" className="text-sm inline-flex items-center gap-2 border border-primary-k text-primary-k rounded-full px-4 py-2"><Calculator className="h-4 w-4" /> Budget Calculator</Link>
                        <Link to="/ai-tools/reassessment-letter" className="text-sm inline-flex items-center gap-2 border border-primary-k text-primary-k rounded-full px-4 py-2"><FilePen className="h-4 w-4" /> Reassessment letter</Link>
                    </div>
                </section>

                <section className="mt-12" data-testid="level-faqs">
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

                <section className="mt-12 flex items-center justify-between gap-4" data-testid="level-prev-next">
                    {prev ? <Link to={`/support-at-home-levels/${prev.slug}`} className="text-sm text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Level {prev.number}</Link> : <span />}
                    {next ? <Link to={`/support-at-home-levels/${next.slug}`} className="text-sm text-primary-k inline-flex items-center gap-1">Level {next.number} <ArrowRight className="h-3 w-3" /></Link> : <span />}
                </section>

                <section className="mt-12" data-testid="level-related">
                    <h2 className="font-heading text-xl text-primary-k tracking-tight">Related guides</h2>
                    <ul className="mt-3 space-y-2 text-sm">
                        <li><Link className="text-primary-k underline" to="/resources/articles/wayly-classification-self-check-support-at-home-levels">Wayly Classification Self-Check: are you on the right level?</Link></li>
                        <li><Link className="text-primary-k underline" to="/resources/articles/wayly-budget-calculator-support-at-home-quarterly-budget">How the Support at Home quarterly budget works</Link></li>
                        <li><Link className="text-primary-k underline" to="/resources/articles/wayly-reassessment-letter-generator-support-at-home-reassessment">How to request a Support at Home reassessment</Link></li>
                    </ul>
                </section>

                <footer className="mt-12 pt-6 border-t border-kindred text-xs text-muted-k space-y-1" data-testid={`trust-${level.slug}`}>
                    <p>Last reviewed: 5 February 2026 · Reviewed by: To be confirmed</p>
                    <p>Funding amounts effective 1 November 2025, indexed each 1 July. Sources: <a href="https://www.health.gov.au/our-work/support-at-home" className="underline" rel="noopener">health.gov.au — Support at Home</a> · <a href="https://www.myagedcare.gov.au/support-at-home" className="underline" rel="noopener">myagedcare.gov.au</a>. Spotted an error? Email <a href="mailto:hello@wayly.com.au" className="underline">hello@wayly.com.au</a>.</p>
                </footer>
            </main>
            <Footer />
        </div>
    );
}
