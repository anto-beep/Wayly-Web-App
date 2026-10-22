import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ARTICLES, GLOSSARY } from "@/data/resources";
import { SEO_ARTICLES_2026 } from "@/data/seoArticles2026";
import { SEO_TOOL_ARTICLES } from "@/data/seoToolArticles";
import { TEMPLATES_LIBRARY } from "@/data/templatesLibrary";
import { ArrowRight, BookOpen, FileText, ListOrdered, TrendingUp } from "lucide-react";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

// Curated quick-access row of the topics families search for most, mixing the
// highest-intent templates, articles and hub pages.
const POPULAR_TOPICS = [
    { label: "Decode my statement", href: "/resources/templates/support-at-home-statement-query-letter" },
    { label: "Dispute an invoice", href: "/resources/templates/aged-care-invoice-dispute-letter" },
    { label: "Get a refund", href: "/resources/templates/aged-care-overcharge-refund-request" },
    { label: "Make a complaint", href: "/resources/articles/how-to-complain-about-aged-care-commission" },
    { label: "Request a reassessment", href: "/resources/templates/my-aged-care-reassessment-request" },
    { label: "Care plan review questions", href: "/resources/templates/care-plan-review-questions" },
    { label: "Grab rails & equipment", href: "/resources/articles/at-hm-scheme-assistive-technology-home-modifications" },
    { label: "Switch providers", href: "/resources/templates/switching-support-at-home-providers-checklist" },
    { label: "Financial hardship", href: "/resources/templates/aged-care-financial-hardship-application" },
    { label: "Support at Home levels", href: "/support-at-home-levels" },
    { label: "CHSP explained", href: "/chsp" },
];

const Card = ({ icon: Icon, title, body, href, count, testId, tone }) => (
    <Link to={href} className="block rounded-2xl p-6 force-white transition-colors" style={{ backgroundColor: tone || "#0E4D52" }} data-testid={testId}>
        <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-heading text-xl">{title}</h3>
                    <span className="text-xs opacity-75 tabular-nums">{count}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed opacity-90">{body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">Browse <ArrowRight className="h-3.5 w-3.5" /></span>
            </div>
        </div>
    </Link>
);

export default function ResourcesIndex() {
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.resources} />
            <MarketingHeader />
            <section className="mx-auto max-w-7xl px-6 pt-12 pb-8" data-testid="resources-hero">
                <span className="overline">Resources hub</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight max-w-3xl">
                    Plain-English Support at Home knowledge. Free for everyone.
                </h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Articles, a glossary of every term you'll see on a statement, and templates for the conversations you didn't think you'd have to have. No signup required.
                </p>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-12 grid sm:grid-cols-3 gap-5">
                <Card icon={BookOpen} title="Articles" body="Pillar pieces on the parts of the program families ask about most." href="/resources/articles" count={`${ARTICLES.length + SEO_ARTICLES_2026.length + SEO_TOOL_ARTICLES.length}+ articles`} testId="resources-card-articles" tone="#0E4D52" />
                <Card icon={ListOrdered} title="Glossary" body="Every acronym, every stream, every contribution rate, defined." href="/resources/glossary" count={`${GLOSSARY.length} terms`} testId="resources-card-glossary" tone="#A5512B" />
                <Card icon={FileText} title="Templates" body="Letters, checklists and conversation prompts, copy, edit, send." href="/resources/templates" count={`${TEMPLATES_LIBRARY.length} templates`} testId="resources-card-templates" tone="#425F47" />
            </section>

            {/* Popular topics quick-access row */}
            <section className="mx-auto max-w-7xl px-6 pb-12" data-testid="resources-popular-topics">
                <div className="flex items-center gap-2 text-primary-k">
                    <TrendingUp className="h-4 w-4 text-gold" />
                    <span className="overline">Popular right now</span>
                </div>
                <div className="mt-4 flex gap-2.5 overflow-x-auto pb-2 -mx-6 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {POPULAR_TOPICS.map((topic, i) => (
                        <Link
                            key={topic.href}
                            to={topic.href}
                            data-testid={`resources-topic-${i}`}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-4 py-2 text-sm font-medium text-primary-k hover:border-[#2BC4D6] hover:bg-surface-2 transition-colors whitespace-nowrap"
                        >
                            {topic.label}
                            <ArrowRight className="h-3.5 w-3.5 opacity-60" />
                        </Link>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-20">
                <span className="overline">Latest articles</span>
                <h2 className="font-heading text-3xl text-primary-k mt-3 tracking-tight">Where to Start</h2>
                <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {(() => {
                        // Curated: pin the two flagship Feb 2026 pieces first
                        // (Where-to-Start Article 1 + Invoice Checker how-to),
                        // then fill remaining slots with the newest of the rest
                        // so the /resources landing always leads with the pieces
                        // we want people to read first.
                        const PIN_SLUGS = [
                            "sah-invoice-checker-verify-support-at-home-invoice-five-minutes",
                            "support-at-home-vs-home-care-packages-what-changed",
                        ];
                        const all = [...SEO_TOOL_ARTICLES, ...SEO_ARTICLES_2026, ...ARTICLES];
                        const pinned = PIN_SLUGS
                            .map((s) => all.find((a) => a.slug === s))
                            .filter(Boolean);
                        const pinnedSet = new Set(PIN_SLUGS);
                        const fill = all
                            .filter((a) => !pinnedSet.has(a.slug))
                            .sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")))
                            .slice(0, 6 - pinned.length);
                        return [...pinned, ...fill].map((a) => (
                            <Link key={a.slug} to={`/resources/articles/${a.slug}`} className="block bg-surface border border-kindred rounded-2xl p-6 transition-colors" data-testid={`resources-article-${a.slug}`}>
                                <h3 className="font-heading text-lg text-primary-k">{a.title}</h3>
                                <p className="mt-2 text-sm text-muted-k leading-relaxed line-clamp-3">{a.excerpt}</p>
                                <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k">Read <ArrowRight className="h-3.5 w-3.5" /></span>
                            </Link>
                        ));
                    })()}
                </div>
            </section>

            <Footer />
        </div>
    );
}
