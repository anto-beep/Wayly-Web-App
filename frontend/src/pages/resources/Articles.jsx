import React from "react";
import { Link, useParams } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ARTICLES } from "@/data/resources";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function ArticlesIndex() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-5xl px-6 pt-12 pb-6" data-testid="articles-page">
                <Link to="/resources" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Resources</Link>
                <span className="overline mt-6 block">Articles</span>
                <h1 className="font-heading text-5xl text-primary-k tracking-tight mt-4 leading-tight">{ARTICLES.length} pieces, no fluff.</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    The things families ask us most often, written in plain English with the program citations behind every claim.
                </p>
            </section>
            <section className="mx-auto max-w-5xl px-6 pb-20 grid sm:grid-cols-2 gap-5">
                {ARTICLES.map((a) => (
                    <Link key={a.slug} to={`/resources/articles/${a.slug}`} className="block bg-surface border border-kindred rounded-2xl p-6 hover:-translate-y-1 hover:shadow-md transition-all" data-testid={`articles-card-${a.slug}`}>
                        <h2 className="font-heading text-xl text-primary-k">{a.title}</h2>
                        <p className="mt-2 text-sm text-muted-k leading-relaxed">{a.excerpt}</p>
                        <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k">Read <ArrowRight className="h-3.5 w-3.5" /></span>
                    </Link>
                ))}
            </section>
            <Footer />
        </div>
    );
}

export function ArticleDetail() {
    const { slug } = useParams();
    const article = ARTICLES.find((a) => a.slug === slug);
    if (!article) {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-3xl px-6 py-20 text-center">
                    <h1 className="font-heading text-3xl text-primary-k">Article not found</h1>
                    <Link to="/resources/articles" className="mt-4 inline-flex items-center gap-1 text-primary-k underline">Back to articles</Link>
                </div>
                <Footer />
            </div>
        );
    }
    const idx = ARTICLES.findIndex((a) => a.slug === slug);
    const next = ARTICLES[(idx + 1) % ARTICLES.length];

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <article className="mx-auto max-w-3xl px-6 pt-12 pb-12" data-testid={`article-${slug}`}>
                <Link to="/resources/articles" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> All articles</Link>
                <span className="overline mt-6 block">Article</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight">{article.title}</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">{article.excerpt}</p>
                <div className="mt-8 space-y-5 text-primary-k leading-relaxed">
                    {article.body.map((para, i) => (
                        <p key={i} className="text-base leading-loose">{para}</p>
                    ))}
                </div>
                <div className="mt-12 pt-8 border-t border-kindred">
                    <span className="overline">Up next</span>
                    <Link to={`/resources/articles/${next.slug}`} className="block mt-3 bg-surface border border-kindred rounded-2xl p-5 hover:bg-surface-2 transition-colors">
                        <h3 className="font-heading text-lg text-primary-k">{next.title}</h3>
                        <span className="mt-2 inline-flex items-center gap-1 text-sm text-primary-k">Read <ArrowRight className="h-3.5 w-3.5" /></span>
                    </Link>
                </div>
            </article>
            <Footer />
        </div>
    );
}
