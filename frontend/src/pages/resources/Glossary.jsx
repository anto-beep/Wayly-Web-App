import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { GLOSSARY as STATIC_GLOSSARY } from "@/data/resources";
import { Search, ArrowLeft } from "lucide-react";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export default function Glossary() {
    const [q, setQ] = useState("");
    const [terms, setTerms] = useState(STATIC_GLOSSARY);
    useEffect(() => {
        axios.get(`${API}/public/cms/glossary`)
            .then((r) => {
                const cms = r.data.terms || [];
                if (cms.length) {
                    // Normalise CMS shape ({term, definition}) to static shape ({term, def})
                    setTerms(cms.map((t) => ({ term: t.term, def: t.definition })));
                }
            })
            .catch(() => {});
    }, []);
    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return terms;
        return terms.filter((g) => g.term.toLowerCase().includes(needle) || g.def.toLowerCase().includes(needle));
    }, [q, terms]);

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.glossary} />
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-6" data-testid="glossary-page">
                <Link to="/resources" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Resources</Link>
                <span className="overline mt-6 block">Glossary</span>
                <h1 className="font-heading text-5xl text-primary-k tracking-tight mt-4 leading-tight">Every term, defined.</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    {terms.length} Australian aged-care terms — the acronyms, classifications, contribution rates and Support at Home / Home Care Package concepts you'll see on statements and care plans.
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20">
                <div className="bg-surface border border-kindred rounded-xl p-3 flex items-center gap-3 mb-6 sticky top-[68px] z-10 backdrop-blur-xl bg-[rgba(250,247,242,0.95)]">
                    <Search className="h-4 w-4 text-muted-k flex-shrink-0 ml-1" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search 37 terms…"
                        data-testid="glossary-search"
                        className="flex-1 bg-transparent text-sm focus:outline-none"
                    />
                    {q && (
                        <span className="text-xs text-muted-k tabular-nums">{filtered.length} matches</span>
                    )}
                </div>

                <ul className="divide-y divide-kindred bg-surface border border-kindred rounded-2xl" data-testid="glossary-list">
                    {filtered.map((g) => (
                        <li key={g.term} className="p-5">
                            <dt className="font-heading text-lg text-primary-k">{g.term}</dt>
                            <dd className="mt-1.5 text-sm text-muted-k leading-relaxed">{g.def}</dd>
                        </li>
                    ))}
                    {filtered.length === 0 && (
                        <li className="p-8 text-center text-muted-k text-sm">No terms match "{q}".</li>
                    )}
                </ul>
            </section>
            <Footer />
        </div>
    );
}
