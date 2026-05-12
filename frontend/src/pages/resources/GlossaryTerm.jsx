import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import SeoHead, { breadcrumbLd, canonicalFor, SITE } from "@/seo/SeoHead";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function definedTermLd({ term, definition, url, related }) {
    const ld = {
        "@context": "https://schema.org",
        "@type": "DefinedTerm",
        name: term,
        description: definition,
        url,
        inDefinedTermSet: {
            "@type": "DefinedTermSet",
            name: "Wayly Aged Care Glossary",
            url: `${SITE.domain}/resources/glossary`,
        },
    };
    if (related && related.length) {
        ld.subjectOf = related.slice(0, 4).map((r) => ({
            "@type": "DefinedTerm",
            name: r.term,
            url: `${SITE.domain}/resources/glossary/${r.slug}`,
        }));
    }
    return ld;
}

export default function GlossaryTerm() {
    const { slug } = useParams();
    const [term, setTerm] = useState(undefined); // undefined=loading

    useEffect(() => {
        setTerm(undefined);
        axios.get(`${API}/public/cms/glossary/${slug}`)
            .then((r) => setTerm(r.data))
            .catch(() => setTerm(null));
    }, [slug]);

    if (term === undefined) {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-3xl px-6 py-20 text-center text-muted-k">Loading…</div>
                <Footer />
            </div>
        );
    }

    if (!term) {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-3xl px-6 py-20 text-center">
                    <h1 className="font-heading text-3xl text-primary-k">Term not found</h1>
                    <Link to="/resources/glossary" className="mt-4 inline-flex items-center gap-1 text-primary-k underline">
                        Back to glossary
                    </Link>
                </div>
                <Footer />
            </div>
        );
    }

    const url = canonicalFor(`/resources/glossary/${slug}`);
    const metaTitle = `What is ${term.term}? · Wayly Aged Care Glossary`;
    const metaDesc =
        term.definition.length > 158
            ? term.definition.slice(0, 157) + "…"
            : term.definition;

    const jsonLd = [
        definedTermLd({ term: term.term, definition: term.definition, url, related: term.related }),
        breadcrumbLd([
            { name: "Home", url: "/" },
            { name: "Resources", url: "/resources" },
            { name: "Glossary", url: "/resources/glossary" },
            { name: term.term, url: `/resources/glossary/${slug}` },
        ]),
    ];

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title={metaTitle}
                description={metaDesc}
                path={`/resources/glossary/${slug}`}
                type="article"
                jsonLd={jsonLd}
            />
            <MarketingHeader />

            <article className="mx-auto max-w-3xl px-6 pt-12 pb-12" data-testid={`glossary-term-${slug}`}>
                <Link to="/resources/glossary" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1">
                    <ArrowLeft className="h-3.5 w-3.5" /> All terms
                </Link>
                <span className="overline mt-6 block">Aged-care glossary</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight">
                    {term.term}
                </h1>

                <div className="mt-6 bg-surface border-l-4 border-primary-k rounded-r-2xl p-5">
                    <div className="text-xs text-muted-k uppercase tracking-wider mb-2">Definition</div>
                    <p className="text-lg text-primary-k leading-relaxed" data-testid="glossary-definition">
                        {term.definition}
                    </p>
                </div>

                {term.related && term.related.length > 0 && (
                    <div className="mt-10" data-testid="glossary-related">
                        <h2 className="font-heading text-xl text-primary-k inline-flex items-center gap-2">
                            <BookOpen className="h-5 w-5" /> Related terms
                        </h2>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                            {term.related.map((r) => (
                                <Link
                                    key={r.slug}
                                    to={`/resources/glossary/${r.slug}`}
                                    className="block bg-surface border border-kindred rounded-xl p-4 hover:border-primary-k transition-all"
                                    data-testid={`glossary-related-${r.slug}`}
                                >
                                    <div className="font-medium text-primary-k">{r.term}</div>
                                    <div className="text-xs text-muted-k mt-1 inline-flex items-center gap-1">
                                        Read more <ArrowRight className="h-3 w-3" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-12 pt-6 border-t border-kindred">
                    <p className="text-sm text-muted-k leading-relaxed">
                        Got a question about <strong>{term.term}</strong> in your statement?{" "}
                        <Link to="/ai-tools/statement-decoder" className="text-primary-k underline">
                            Wayly's Statement Decoder
                        </Link>{" "}
                        explains every line of any Support at Home or Home Care Package statement in plain English.
                    </p>
                </div>
            </article>
            <Footer />
        </div>
    );
}
