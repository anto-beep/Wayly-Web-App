import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ARTICLES as STATIC_ARTICLES } from "@/data/resources";
import { ArrowLeft, ArrowRight, ShieldAlert, BookOpen, ExternalLink } from "lucide-react";

import SeoHead, { articleLd, breadcrumbLd, canonicalFor } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtDate = (iso) => { if (!iso) return null; try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); } catch { return iso; } };

export default function ArticlesIndex() {
    const [articles, setArticles] = useState(null); // null=loading
    useEffect(() => {
        axios.get(`${API}/public/cms/articles`)
            .then((r) => {
                const cms = r.data.articles || [];
                // Merge CMS first, fall back to static if DB is empty
                setArticles(cms.length ? cms : STATIC_ARTICLES);
            })
            .catch(() => setArticles(STATIC_ARTICLES));
    }, []);
    const list = articles || STATIC_ARTICLES;
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.articlesIndex} />
            <MarketingHeader />
            <section className="mx-auto max-w-5xl px-6 pt-12 pb-6" data-testid="articles-page">
                <Link to="/resources" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Resources</Link>
                <span className="overline mt-6 block">Articles</span>
                <h1 className="font-heading text-5xl text-primary-k tracking-tight mt-4 leading-tight">{list.length} pieces, no fluff.</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    The things Australian families ask us most often about Support at Home and Home Care Packages — written in plain English, with program citations behind every claim.
                </p>
            </section>
            <section className="mx-auto max-w-5xl px-6 pb-20 grid sm:grid-cols-2 gap-5">
                {list.map((a) => (
                    <Link key={a.slug} to={`/resources/articles/${a.slug}`} className="block bg-surface border border-kindred rounded-2xl p-6 hover:-translate-y-1 hover:shadow-md transition-all" data-testid={`articles-card-${a.slug}`}>
                        <h2 className="font-heading text-xl text-primary-k">{a.title}</h2>
                        <p className="mt-2 text-sm text-muted-k leading-relaxed">{a.excerpt}</p>
                        {a.is_draft_needs_review && (
                            <span className="mt-3 inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 border border-amber-300 rounded px-2 py-0.5">DRAFT — NEEDS REVIEW</span>
                        )}
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
    const [article, setArticle] = useState(undefined); // undefined=loading, null=not found

    useEffect(() => {
        setArticle(undefined);
        axios.get(`${API}/public/cms/articles/${slug}`)
            .then((r) => setArticle(r.data))
            .catch(() => {
                // Fall back to static registry
                const stat = STATIC_ARTICLES.find((a) => a.slug === slug);
                setArticle(stat ? { ...stat, body_md: stat.body ? stat.body.join("\n\n") : "" } : null);
            });
    }, [slug]);

    if (article === undefined) {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-3xl px-6 py-20 text-center text-muted-k">Loading…</div>
                <Footer />
            </div>
        );
    }

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

    const url = canonicalFor(`/resources/articles/${slug}`);
    const author = article.author ? {
        name: article.author.name,
        jobTitle: article.author.role,
        sameAs: article.author.sameAs,
    } : undefined;
    const reviewer = article.reviewer ? {
        name: article.reviewer.name,
        jobTitle: article.reviewer.role,
        sameAs: article.reviewer.sameAs,
    } : undefined;
    const citation = (article.citations || []).map((c) => ({ title: c.title, url: c.url, publisher: c.publisher }));

    const jsonLd = [
        articleLd({
            headline: article.title,
            description: article.excerpt,
            url,
            datePublished: article.published_at,
            dateModified: article.updated_at,
            author,
            reviewedBy: reviewer,
            citation,
        }),
        breadcrumbLd([
            { name: "Home", url: "/" },
            { name: "Resources", url: "/resources" },
            { name: "Articles", url: "/resources/articles" },
            { name: article.title, url: `/resources/articles/${slug}` },
        ]),
    ];

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title={article.title}
                description={article.excerpt}
                path={`/resources/articles/${slug}`}
                type="article"
                publishedAt={article.published_at}
                updatedAt={article.updated_at}
                author={article.author?.name}
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <article className="mx-auto max-w-3xl px-6 pt-12 pb-12" data-testid={`article-${slug}`}>
                <Link to="/resources/articles" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> All articles</Link>
                <span className="overline mt-6 block">Article</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight">{article.title}</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">{article.excerpt}</p>

                {article.is_draft_needs_review && (
                    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="article-draft-banner">
                        <ShieldAlert className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        <div className="text-sm leading-relaxed">
                            <strong className="font-medium">DRAFT — NEEDS REVIEW.</strong> This article hasn't been reviewed by a qualified Australian aged-care professional yet. Treat it as a starting point only. Always verify against <a href="https://www.health.gov.au/our-work/support-at-home" target="_blank" rel="noopener noreferrer" className="underline">health.gov.au</a> or seek personal advice before acting.
                        </div>
                    </div>
                )}

                {/* Author + reviewer (E-E-A-T) */}
                {(article.author || article.reviewer) && (
                    <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-k" data-testid="article-eeat">
                        {article.author && (
                            <span><strong className="text-primary-k">Written by</strong> {article.author.name}{article.author.qualifications && <span className="text-muted-k">, {article.author.qualifications}</span>}</span>
                        )}
                        {article.reviewer && (
                            <span>· <strong className="text-primary-k">Reviewed by</strong> {article.reviewer.name}{article.reviewer.qualifications && <span className="text-muted-k">, {article.reviewer.qualifications}</span>}{article.reviewed_at && ` on ${fmtDate(article.reviewed_at)}`}</span>
                        )}
                        {!article.reviewer && article.published_at && (
                            <span>· Published {fmtDate(article.published_at)}</span>
                        )}
                    </div>
                )}

                <div className="mt-8 prose prose-lg max-w-none text-primary-k leading-loose [&>h2]:font-heading [&>h2]:text-2xl [&>h2]:text-primary-k [&>h2]:mt-10 [&>h2]:mb-3 [&>h3]:font-heading [&>h3]:text-xl [&>h3]:mt-8 [&>h3]:mb-2 [&>p]:my-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:list-decimal [&>ol]:pl-6 [&>li]:my-1 [&>a]:underline [&>a]:text-primary-k [&>blockquote]:border-l-4 [&>blockquote]:border-kindred [&>blockquote]:pl-4 [&>blockquote]:italic">
                    <ReactMarkdown>{article.body_md || ""}</ReactMarkdown>
                </div>

                {/* Citations */}
                {citation && citation.length > 0 && (
                    <div className="mt-12 pt-6 border-t border-kindred" data-testid="article-citations">
                        <h2 className="font-heading text-xl text-primary-k inline-flex items-center gap-2"><BookOpen className="h-5 w-5" /> Sources</h2>
                        <ul className="mt-3 space-y-2 text-sm text-muted-k">
                            {citation.map((c, i) => (
                                <li key={i}>
                                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary-k underline inline-flex items-center gap-1">
                                        {c.title} {c.publisher && <span className="text-muted-k">— {c.publisher}</span>} <ExternalLink className="h-3 w-3" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </article>
            <Footer />
        </div>
    );
}
