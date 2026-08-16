import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHubLinks from "@/components/SeoHubLinks";
import SeoHead from "@/seo/SeoHead";
import { FAQ_GROUPS, ALL_FAQ_QUESTIONS } from "@/data/faq";

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
                title="Frequently asked questions about Support at Home and Wayly | Wayly"
                description="Forty plain-English answers to the questions Australian families ask most about Support at Home, providers, money, carers, and the Wayly platform."
                canonical="https://wayly.com.au/faq"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-3xl px-6 pt-10 pb-16">
                <span className="overline">FAQ</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-[#0E2A47] mt-3 leading-tight tracking-tight" data-testid="faq-h1">
                    Frequently asked questions
                </h1>
                <p className="mt-4 text-[#3C4A5E] leading-relaxed">
                    Forty answers across five themes. If you cannot find what you are looking for, try the Wayly AI tools or send us an email at support@wayly.com.au.
                </p>

                <div className="mt-8 relative" data-testid="faq-search-wrap">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4A5A75]" aria-hidden />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search the FAQ"
                        aria-label="Search the FAQ"
                        data-testid="faq-search-input"
                        className="w-full rounded-full border border-[#CFE0F0] bg-white pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2BC4D6]"
                    />
                </div>

                {filteredGroups.length === 0 && (
                    <div className="mt-8 rounded-2xl border border-[#CFE0F0] bg-white p-6 text-sm text-[#4A5A75]" data-testid="faq-empty">
                        No matches. Try a shorter term or browse the categories below the search.
                    </div>
                )}

                {filteredGroups.map((g) => (
                    <section key={g.id} className="mt-12" id={g.id} data-testid={`faq-group-${g.id}`}>
                        <h2 className="font-heading text-2xl text-[#0E2A47] tracking-tight">{g.title}</h2>
                        <div className="mt-4 divide-y divide-[#CFE0F0] border-y border-[#CFE0F0]">
                            {g.questions.map((f, i) => (
                                <details key={i} className="group py-4" data-testid={`faq-q-${g.id}-${i}`}>
                                    <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-[#0E2A47] font-semibold">
                                        <span>{f.q}</span>
                                        <ChevronRight className="h-4 w-4 mt-1 text-[#4A5A75] group-open:rotate-90 transition-transform" aria-hidden />
                                    </summary>
                                    <div className="mt-3 text-[15px] leading-relaxed text-[#3C4A5E]">
                                        {f.a}
                                    </div>
                                </details>
                            ))}
                        </div>
                    </section>
                ))}

                <section className="mt-16 rounded-2xl border border-[#CFE0F0] bg-white p-6">
                    <h2 className="font-heading text-xl text-[#0E2A47]">Still stuck?</h2>
                    <p className="mt-2 text-sm text-[#4A5A75]">Ask Wayly directly. It is free and answers based only on the public Support at Home rules, never your private statement.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/ask-wayly" className="inline-flex items-center gap-2 rounded-full bg-[#0E2A47] hover:bg-[#091D33] text-white px-5 py-2.5 text-sm font-semibold">Ask Wayly</Link>
                        <Link to="/contact" className="inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] px-5 py-2.5 text-sm font-semibold hover:border-[#2BC4D6]">Send a question</Link>
                    </div>
                </section>
            </div>
            </main>
            <SeoHubLinks exclude="/faq" />
            <Footer />
        </div>
    );
}
