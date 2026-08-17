import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHubLinks from "@/components/SeoHubLinks";
import SeoHead from "@/seo/SeoHead";
import Reveal from "@/components/Reveal";
import { FAQ_GROUPS, ALL_FAQ_QUESTIONS } from "@/data/faq";

const CLAY = "#A5512B";

export default function FaqHub() {
    const [query, setQuery] = useState("");

    const filteredGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return FAQ_GROUPS;
        return FAQ_GROUPS.map((g) => ({
            ...g,
            questions: g.questions.filter((item) => `${item.q} ${item.a}`.toLowerCase().includes(q)),
        })).filter((g) => g.questions.length > 0);
    }, [query]);

    const jumpTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: "https://wayly.com.au/" },
                    { "@type": "ListItem", position: 2, name: "FAQ" },
                ],
            },
            {
                "@type": "FAQPage",
                mainEntity: ALL_FAQ_QUESTIONS.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
            },
        ],
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Frequently Asked Questions About Support at Home and Wayly | Wayly"
                description="Plain-English answers to the questions Australian families ask most about Support at Home: eligibility, budgets, rates, providers, carers, and the Wayly platform."
                canonical="https://wayly.com.au/faq"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-3xl px-6 pt-12 pb-16">
                <Reveal>
                    <span className="overline">FAQ</span>
                    <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 leading-tight tracking-tight" data-testid="faq-h1">
                        Frequently Asked <span style={{ color: CLAY }}>Questions</span>
                    </h1>
                    <p className="mt-4 text-muted-k leading-relaxed">
                        Plain-English answers across five themes. If you cannot find what you are looking for, ask Wayly directly or email us at support@wayly.com.au.
                    </p>
                </Reveal>

                <div className="mt-8 relative" data-testid="faq-search-wrap">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-k" aria-hidden />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search the FAQ"
                        aria-label="Search the FAQ"
                        data-testid="faq-search-input"
                        className="w-full rounded-full border border-kindred bg-white pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2"
                        style={{ boxShadow: "none" }}
                        onFocus={(e) => (e.target.style.borderColor = CLAY)}
                        onBlur={(e) => (e.target.style.borderColor = "")}
                    />
                </div>

                {/* Category quick-nav, single horizontal scroller */}
                {!query && (
                    <div className="mt-5 -mx-6 px-6 overflow-x-auto" data-testid="faq-category-nav">
                        <div className="flex gap-2 w-max">
                            {FAQ_GROUPS.map((g) => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => jumpTo(g.id)}
                                    data-testid={`faq-chip-${g.id}`}
                                    className="flex-shrink-0 whitespace-nowrap rounded-full border border-kindred bg-surface px-4 py-2 text-sm text-primary-k transition-colors hover:border-[#A5512B] hover:text-[#A5512B]"
                                >
                                    {g.title}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {filteredGroups.length === 0 && (
                    <div className="mt-8 rounded-2xl border border-kindred bg-white p-6 text-sm text-muted-k" data-testid="faq-empty">
                        No matches. Try a shorter term or clear the search to browse every category.
                    </div>
                )}

                {filteredGroups.map((g) => (
                    <Reveal key={g.id} as="section" className="mt-12 scroll-mt-24" data-testid={`faq-group-${g.id}`}>
                        <div id={g.id} className="scroll-mt-24">
                            <div className="flex items-center gap-3">
                                <span className="block h-1 w-10 rounded-full" style={{ background: CLAY }} aria-hidden />
                                <h2 className="font-heading text-2xl tracking-tight" style={{ color: CLAY }}>{g.title}</h2>
                            </div>
                            <div className="mt-4 space-y-3">
                                {g.questions.map((f, i) => (
                                    <details key={i} className="group rounded-xl border border-kindred bg-surface px-5 py-4 transition-colors hover:border-[#A5512B]/40" data-testid={`faq-q-${g.id}-${i}`}>
                                        <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-primary-k font-semibold">
                                            <span>{f.q}</span>
                                            <ChevronRight className="h-4 w-4 mt-1 flex-none text-muted-k group-open:rotate-90 transition-transform" aria-hidden />
                                        </summary>
                                        <div className="mt-3 text-[15px] leading-relaxed text-muted-k">
                                            {f.a}
                                        </div>
                                    </details>
                                ))}
                            </div>
                        </div>
                    </Reveal>
                ))}

                <Reveal as="section" className="mt-16 rounded-2xl border border-kindred bg-surface p-6">
                    <h2 className="font-heading text-xl text-primary-k">Still Stuck?</h2>
                    <p className="mt-2 text-sm text-muted-k">Ask Wayly directly. It is free and answers based only on the public Support at Home rules, never your private statement.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/ask-wayly" data-testid="faq-cta-ask" className="inline-flex items-center gap-2 rounded-full bg-primary-k hover:bg-[#091D33] text-white px-5 py-2.5 text-sm font-semibold">Ask Wayly</Link>
                        <Link to="/contact" data-testid="faq-cta-contact" className="inline-flex items-center gap-2 rounded-full bg-white text-primary-k border border-kindred px-5 py-2.5 text-sm font-semibold hover:border-[#A5512B]">Send a Question</Link>
                    </div>
                </Reveal>
            </div>
            </main>
            <SeoHubLinks exclude="/faq" />
            <Footer />
        </div>
    );
}
