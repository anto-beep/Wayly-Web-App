import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ARTICLES as STATIC_ARTICLES } from "@/data/resources";
import { SEO_ARTICLES_2026 } from "@/data/seoArticles2026";
import { SEO_TOOL_ARTICLES } from "@/data/seoToolArticles";
import { ARTICLE_PILLAR_MAP } from "@/data/articlePillars";
import { ArrowLeft, ArrowRight, ShieldAlert, BookOpen, ExternalLink, ChevronDown, Twitter, Linkedin, Mail, Link2, Sparkles } from "lucide-react";

import SeoHead, { articleLd, breadcrumbLd, canonicalFor } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtDate = (iso) => { if (!iso) return null; try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); } catch { return iso; } };

// Merge the structured 2026 SEO articles into the existing static catalog so
// they appear on the index page and at /resources/articles/:slug.
// Sort newest-first by published_at so freshly added articles head the index.
const _byDateDesc = (a, b) => String(b.published_at || "").localeCompare(String(a.published_at || ""));
const STRUCTURED_SEO_ARTICLES = [
    ...SEO_TOOL_ARTICLES,
    ...SEO_ARTICLES_2026,
].sort(_byDateDesc);
const ALL_STATIC_ARTICLES = [
    ...STRUCTURED_SEO_ARTICLES,
    ...STATIC_ARTICLES,
];

function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function readingTimeMinutes(article) {
    const all = [
        article.intro_md || "",
        ...(article.sections || []).map((s) => `${s.heading} ${s.body_md}`),
        ...(article.faqs || []).map((f) => `${f.q} ${f.a}`),
        ...(article.key_takeaways || []),
    ].join(" ");
    const words = (all.match(/\S+/g) || []).length;
    return Math.max(1, Math.round(words / 220));
}

function faqLd(faqs) {
    return {
        "@type": "FAQPage",
        mainEntity: (faqs || []).map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
    };
}

export default function ArticlesIndex() {
    const [articles, setArticles] = useState(null);
    useEffect(() => {
        axios.get(`${API}/public/cms/articles`)
            .then((r) => {
                const cms = r.data.articles || [];
                // Always include the structured SEO articles first (newest), then CMS,
                // then the older static catalog as a fallback.
                const cmsSlugs = new Set(cms.map((a) => a.slug));
                const structured = STRUCTURED_SEO_ARTICLES.filter((a) => !cmsSlugs.has(a.slug));
                const olderStatic = STATIC_ARTICLES.filter((a) => !cmsSlugs.has(a.slug) && !structured.find((s) => s.slug === a.slug));
                setArticles([...structured, ...cms, ...olderStatic]);
            })
            .catch(() => setArticles(ALL_STATIC_ARTICLES));
    }, []);
    const list = articles || ALL_STATIC_ARTICLES;
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.articlesIndex} />
            <MarketingHeader />
            <section className="mx-auto max-w-5xl px-6 pt-12 pb-6" data-testid="articles-page">
                <Link to="/resources" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Resources</Link>
                <span className="overline mt-6 block">Articles</span>
                <h1 className="font-heading text-5xl text-primary-k tracking-tight mt-4 leading-tight">{list.length} pieces, no fluff.</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    The things Australian families ask us most often about Support at Home and Home Care Packages, written in plain English, with program citations behind every claim.
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
        // Try the structured SEO article registries first (no API call needed,
        // we control the layout end-to-end for these).
        const seo = STRUCTURED_SEO_ARTICLES.find((a) => a.slug === slug);
        if (seo) { setArticle({ ...seo, structured: true }); return; }
        axios.get(`${API}/public/cms/articles/${slug}`)
            .then((r) => setArticle(r.data))
            .catch(() => {
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

    if (article.structured) {
        return <StructuredArticle article={article} slug={slug} />;
    }

    // Legacy (non-structured) renderer below — unchanged behaviour for the
    // older static articles and CMS-driven posts.
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

                {/* Author + reviewer + published date intentionally hidden per editorial direction. */}

                <div className="mt-8 prose prose-lg max-w-none text-primary-k leading-loose [&>h2]:font-heading [&>h2]:text-2xl [&>h2]:text-primary-k [&>h2]:mt-10 [&>h2]:mb-3 [&>h3]:font-heading [&>h3]:text-xl [&>h3]:mt-8 [&>h3]:mb-2 [&>p]:my-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:list-decimal [&>ol]:pl-6 [&>li]:my-1 [&>a]:underline [&>a]:text-primary-k [&>blockquote]:border-l-4 [&>blockquote]:border-kindred [&>blockquote]:pl-4 [&>blockquote]:italic">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body_md || ""}</ReactMarkdown>
                </div>

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

// ---------------------------------------------------------------------------
// Structured article renderer (2026 SEO articles)
// ---------------------------------------------------------------------------

function StructuredArticle({ article, slug }) {
    // Articles can opt into a custom public path (e.g. /articles/<slug>) for
    // their canonical URL while still being reachable at /resources/articles/<slug>.
    const publicPath = article.canonical_path || `/resources/articles/${slug}`;
    const url = canonicalFor(publicPath);
    const readingTime = useMemo(() => readingTimeMinutes(article), [article]);
    const tocItems = useMemo(
        () => (article.sections || []).map((s) => ({ id: slugify(s.heading), text: s.heading })),
        [article.sections],
    );
    const relatedArticles = useMemo(
        () => (article.related || [])
            .map((s) => STRUCTURED_SEO_ARTICLES.find((a) => a.slug === s) || STATIC_ARTICLES.find((a) => a.slug === s))
            .filter(Boolean),
        [article.related],
    );

    const jsonLdGraph = [
        {
            "@type": "Article",
            headline: article.title,
            description: article.excerpt,
            url,
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            datePublished: article.published_at,
            dateModified: article.updated_at || article.published_at,
            author: { "@type": "Person", name: article.author?.name || "Antony Chiware" },
            publisher: {
                "@type": "Organization",
                name: "Wayly",
                logo: { "@type": "ImageObject", url: canonicalFor("/branding/png/wayly-mark-512.png") },
            },
            image: canonicalFor(`/api/public/seo/og.png?title=${encodeURIComponent(article.title)}`),
        },
        faqLd(article.faqs),
        {
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: canonicalFor("/") },
                { "@type": "ListItem", position: 2, name: "Articles", item: canonicalFor("/resources/articles") },
                { "@type": "ListItem", position: 3, name: article.title, item: url },
            ],
        },
    ];

    if (article.howto?.steps?.length) {
        jsonLdGraph.push({
            "@type": "HowTo",
            name: article.howto.name || article.title,
            description: article.howto.description || article.excerpt,
            step: article.howto.steps.map((s, i) => ({
                "@type": "HowToStep",
                position: i + 1,
                name: s.name,
                text: s.text,
            })),
        });
    }

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": jsonLdGraph,
    };

    const handleCopyLink = () => {
        try {
            navigator.clipboard.writeText(window.location.href);
        } catch { /* ignore */ }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title={article.meta?.title || article.title}
                description={article.meta?.description || article.excerpt}
                path={publicPath}
                type="article"
                publishedAt={article.published_at}
                updatedAt={article.updated_at}
                author={article.author?.name}
                jsonLd={[jsonLd]}
            />
            <MarketingHeader />
            <article className="mx-auto max-w-3xl px-6 pt-12 pb-12" data-testid={`article-${slug}`}>
                <Link to="/resources/articles" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> All articles</Link>
                <span className="overline mt-6 block">Article</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight">{article.title}</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">{article.excerpt}</p>

                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-k" data-testid="article-meta">
                    {article.author?.name && (
                        <span className="text-primary-k font-medium" data-testid="article-byline">By {article.author.name}</span>
                    )}
                    <span data-testid="article-reviewer">Reviewed by: To be confirmed</span>
                    {article.published_at && (
                        <span data-testid="article-published">Published {new Date(article.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>
                    )}
                    {article.updated_at && article.updated_at !== article.published_at && (
                        <span data-testid="article-updated">Updated {new Date(article.updated_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>
                    )}
                    <span>{readingTime} min read</span>
                </div>

                <ShareButtons title={article.title} onCopyLink={handleCopyLink} />

                {/* Key takeaways callout */}
                {article.key_takeaways?.length > 0 && (
                    <aside className="mt-10 rounded-2xl border-l-4 border-gold bg-surface-2 p-5" data-testid="article-key-takeaways" aria-labelledby="kt-heading">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-gold" />
                            <h2 id="kt-heading" className="font-heading text-lg text-primary-k m-0">Key takeaways</h2>
                        </div>
                        <ul className="mt-3 list-disc pl-6 space-y-2 text-sm text-primary-k leading-relaxed">
                            {article.key_takeaways.map((k, i) => <li key={i}>{k}</li>)}
                        </ul>
                    </aside>
                )}

                {/* Intro */}
                {article.intro_md && (
                    <ProseBlock>{article.intro_md}</ProseBlock>
                )}

                {/* Table of contents */}
                {tocItems.length > 2 && (
                    <nav className="mt-10 rounded-2xl border border-kindred bg-surface p-5" data-testid="article-toc" aria-labelledby="toc-heading">
                        <h2 id="toc-heading" className="font-heading text-base text-primary-k m-0">In this article</h2>
                        <ol className="mt-3 space-y-1.5 text-sm">
                            {tocItems.map((it) => (
                                <li key={it.id}><a href={`#${it.id}`} className="text-primary-k hover:underline">{it.text}</a></li>
                            ))}
                        </ol>
                    </nav>
                )}

                {/* Sections */}
                {(article.sections || []).map((s) => (
                    <section key={s.heading} className="mt-10" data-testid={`section-${slugify(s.heading)}`}>
                        <h2 id={slugify(s.heading)} className="font-heading text-2xl text-primary-k tracking-tight">{s.heading}</h2>
                        <ProseBlock>{s.body_md}</ProseBlock>
                    </section>
                ))}

                {/* FAQ accordion */}
                {article.faqs?.length > 0 && <FAQAccordion faqs={article.faqs} />}

                {/* Related articles */}
                {relatedArticles.length > 0 && (
                    <section className="mt-12 pt-8 border-t border-kindred" data-testid="article-related">
                        <h2 className="font-heading text-xl text-primary-k">Related reading</h2>
                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            {relatedArticles.map((r) => (
                                <Link key={r.slug} to={`/resources/articles/${r.slug}`} className="block bg-surface border border-kindred rounded-2xl p-5 hover:-translate-y-1 hover:shadow-md transition-all" data-testid={`related-${r.slug}`}>
                                    <h3 className="font-heading text-base text-primary-k">{r.title}</h3>
                                    <p className="mt-2 text-sm text-muted-k leading-relaxed">{r.excerpt}</p>
                                    <span className="mt-2 inline-flex items-center gap-1 text-sm text-primary-k">Read <ArrowRight className="h-3.5 w-3.5" /></span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* Phase 5 — pillar cross-links to /services/* /policy/* /guides/* and the tool itself. */}
                {ARTICLE_PILLAR_MAP[article.slug] && (
                    <section className="mt-10 pt-6 border-t border-kindred" data-testid="article-pillars">
                        <h2 className="font-heading text-xl text-primary-k">Pillars on Wayly</h2>
                        <div className="mt-4 grid sm:grid-cols-3 gap-4">
                            {ARTICLE_PILLAR_MAP[article.slug].map((p) => (
                                <Link key={p.href} to={p.href} className="block bg-surface border border-kindred rounded-2xl p-4 hover:-translate-y-0.5 hover:border-[#2BC4D6] transition-all" data-testid={`article-pillar-${p.href.replace(/[^a-z0-9]+/gi, "-")}`}>
                                    <div className="font-heading text-base text-primary-k leading-snug">{p.label}</div>
                                    <p className="mt-1 text-xs text-muted-k">{p.sub}</p>
                                    <span className="mt-3 inline-flex items-center gap-1 text-sm text-[#1565B8]">Visit <ArrowRight className="h-3.5 w-3.5" /></span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <ShareButtons title={article.title} onCopyLink={handleCopyLink} className="mt-10" />

                {/* Last reviewed footer — Phase 3 E-E-A-T trust signal for YMYL content. */}
                {(article.updated_at || article.published_at) && (
                    <footer className="mt-12 pt-6 border-t border-kindred text-xs text-muted-k space-y-1" data-testid="article-trust-footer">
                        <p>Last reviewed: {new Date(article.updated_at || article.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })} · Reviewed by: To be confirmed</p>
                        <p>Wayly content is researched against primary sources from health.gov.au, myagedcare.gov.au, servicesaustralia.gov.au and agedcarequality.gov.au. If you find an error, email <a href="mailto:hello@wayly.com.au" className="underline">hello@wayly.com.au</a>.</p>
                    </footer>
                )}
            </article>
            <Footer />
        </div>
    );
}

function ProseBlock({ children }) {
    return (
        <div className="mt-4 prose prose-lg max-w-none text-primary-k leading-loose
            [&_p]:my-4
            [&_a]:underline [&_a]:text-primary-k
            [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1
            [&_ol]:list-decimal [&_ol]:pl-6
            [&_blockquote]:border-l-4 [&_blockquote]:border-gold [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-primary-k/90 [&_blockquote]:my-6
            [&_table]:w-full [&_table]:my-6 [&_table]:border-collapse
            [&_th]:bg-surface-2 [&_th]:text-left [&_th]:text-primary-k [&_th]:font-semibold [&_th]:p-3 [&_th]:border [&_th]:border-kindred
            [&_td]:p-3 [&_td]:border [&_td]:border-kindred [&_td]:align-top
            [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    th: ({ node, ...p }) => <th scope="col" {...p} />,
                }}
            >{children}</ReactMarkdown>
        </div>
    );
}

function FAQAccordion({ faqs }) {
    const [openIdx, setOpenIdx] = useState(null);
    return (
        <section className="mt-12" data-testid="article-faq" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="font-heading text-2xl text-primary-k tracking-tight">Frequently asked questions</h2>
            <dl className="mt-5 divide-y divide-kindred border border-kindred rounded-2xl bg-surface overflow-hidden">
                {faqs.map((f, i) => {
                    const open = openIdx === i;
                    return (
                        <div key={i}>
                            <dt>
                                <button
                                    type="button"
                                    aria-expanded={open}
                                    aria-controls={`faq-panel-${i}`}
                                    onClick={() => setOpenIdx(open ? null : i)}
                                    className="w-full flex items-center justify-between text-left p-4 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                                    data-testid={`faq-question-${i}`}
                                >
                                    <span className="font-medium text-primary-k">{f.q}</span>
                                    <ChevronDown className={`h-4 w-4 text-muted-k flex-none transition-transform ${open ? "rotate-180" : ""}`} />
                                </button>
                            </dt>
                            {open && (
                                <dd id={`faq-panel-${i}`} className="px-4 pb-4 text-sm text-primary-k leading-relaxed" data-testid={`faq-answer-${i}`}>
                                    {f.a}
                                </dd>
                            )}
                        </div>
                    );
                })}
            </dl>
        </section>
    );
}

function ShareButtons({ title, onCopyLink, className = "" }) {
    const href = typeof window !== "undefined" ? window.location.href : "";
    const enc = encodeURIComponent;
    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`} data-testid="article-share">
            <span className="text-xs uppercase tracking-wider text-muted-k mr-1">Share</span>
            <a href={`https://twitter.com/intent/tweet?url=${enc(href)}&text=${enc(title)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Twitter" className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-kindred text-primary-k hover:bg-surface-2"><Twitter className="h-3.5 w-3.5" /></a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(href)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn" className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-kindred text-primary-k hover:bg-surface-2"><Linkedin className="h-3.5 w-3.5" /></a>
            <a href={`mailto:?subject=${enc(title)}&body=${enc(href)}`} aria-label="Share by email" className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-kindred text-primary-k hover:bg-surface-2"><Mail className="h-3.5 w-3.5" /></a>
            <button type="button" onClick={onCopyLink} aria-label="Copy link" className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-kindred text-primary-k hover:bg-surface-2" data-testid="article-share-copy"><Link2 className="h-3.5 w-3.5" /></button>
        </div>
    );
}
