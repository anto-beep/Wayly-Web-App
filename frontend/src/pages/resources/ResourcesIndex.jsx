import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ARTICLES, GLOSSARY, TEMPLATES } from "@/data/resources";
import { ArrowRight, BookOpen, FileText, ListOrdered } from "lucide-react";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
const Card = ({ icon: Icon, title, body, href, count, testId }) => (
    <Link to={href} className="block bg-surface border border-kindred rounded-2xl p-6 hover:-translate-y-1 hover:shadow-md transition-all" data-testid={testId}>
        <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-primary-k" />
            </div>
            <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-heading text-xl text-primary-k">{title}</h3>
                    <span className="text-xs text-muted-k tabular-nums">{count}</span>
                </div>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">{body}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k">Browse <ArrowRight className="h-3.5 w-3.5" /></span>
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
                    Plain-English Support at Home knowledge — free for everyone.
                </h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Articles, a glossary of every term you'll see on a statement, and templates for the conversations you didn't think you'd have to have. No signup required.
                </p>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-12 grid sm:grid-cols-3 gap-5">
                <Card icon={BookOpen} title="Articles" body="Pillar pieces on the parts of the program families ask about most." href="/resources/articles" count={`${ARTICLES.length} articles`} testId="resources-card-articles" />
                <Card icon={ListOrdered} title="Glossary" body="Every acronym, every stream, every contribution rate — defined." href="/resources/glossary" count={`${GLOSSARY.length} terms`} testId="resources-card-glossary" />
                <Card icon={FileText} title="Templates" body="Letters, checklists and conversation prompts — copy, edit, send." href="/resources/templates" count={`${TEMPLATES.length} templates`} testId="resources-card-templates" />
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-20">
                <span className="overline">Latest articles</span>
                <h2 className="font-heading text-3xl text-primary-k mt-3 tracking-tight">Where to start</h2>
                <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {ARTICLES.slice(0, 6).map((a) => (
                        <Link key={a.slug} to={`/resources/articles/${a.slug}`} className="block bg-surface border border-kindred rounded-2xl p-6 hover:-translate-y-1 hover:shadow-md transition-all" data-testid={`resources-article-${a.slug}`}>
                            <h3 className="font-heading text-lg text-primary-k">{a.title}</h3>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed line-clamp-3">{a.excerpt}</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k">Read <ArrowRight className="h-3.5 w-3.5" /></span>
                        </Link>
                    ))}
                </div>
            </section>

            <Footer />
        </div>
    );
}
