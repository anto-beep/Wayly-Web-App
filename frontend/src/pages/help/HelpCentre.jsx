import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead, { breadcrumbLd, canonicalFor } from "@/seo/SeoHead";
import {
    ArrowLeft, ArrowRight, Search, X, LifeBuoy, ThumbsUp, ThumbsDown,
    MessageCircle, BookOpen, ChevronRight,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); }
    catch { return iso; }
};

// ---------------------------------------------------------------------------
// Public Help Centre index
// ---------------------------------------------------------------------------
export default function HelpCentre() {
    const [categories, setCategories] = useState(null);
    const [popular, setPopular] = useState([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef(null);

    useEffect(() => {
        axios.get(`${API}/public/help/categories`).then((r) => setCategories(r.data.categories || [])).catch(() => setCategories([]));
        axios.get(`${API}/public/help/articles`, { params: { limit: 6 } }).then((r) => setPopular(r.data.articles || [])).catch(() => setPopular([]));
    }, []);

    const runSearch = useCallback((q) => {
        const term = q.trim();
        if (!term) { setResults(null); setSearching(false); return; }
        setSearching(true);
        axios.get(`${API}/public/help/articles`, { params: { q: term, limit: 50 } })
            .then((r) => setResults(r.data.articles || []))
            .catch(() => setResults([]))
            .finally(() => setSearching(false));
    }, []);

    const onChange = (e) => {
        const v = e.target.value;
        setQuery(v);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(v), 350);
    };

    const activeCategories = useMemo(() => (categories || []).filter((c) => c.count > 0), [categories]);
    const totalPublished = useMemo(() => (categories || []).reduce((n, c) => n + c.count, 0), [categories]);

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [breadcrumbLd([{ name: "Home", url: "/" }, { name: "Help Centre", url: "/help" }])],
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Help Centre | Wayly"
                description="Find answers about using Wayly — plans and billing, the Statement Decoder, Invoice Checker, Ask Wayly, your account and privacy, and the Support at Home program."
                path="/help"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
                <section className="mx-auto max-w-5xl px-6 pt-12 pb-6" data-testid="help-centre-page">
                    <span className="overline inline-flex items-center gap-2"><LifeBuoy className="h-4 w-4" /> Help Centre</span>
                    <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight" data-testid="help-centre-h1">
                        How Can We Help?
                    </h1>
                    <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                        Answers to the things Wayly customers ask most — plans, billing, the tools, your account, and the Support at Home program.
                    </p>

                    {/* Search */}
                    <div className="mt-8 relative max-w-xl" data-testid="help-search-wrap">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-k" aria-hidden />
                        <input
                            type="search"
                            value={query}
                            onChange={onChange}
                            placeholder="Search the Help Centre"
                            aria-label="Search the Help Centre"
                            data-testid="help-search-input"
                            className="w-full rounded-full border border-kindred bg-surface pl-11 pr-11 py-3 text-sm text-primary-k placeholder:text-muted-k focus:outline-none focus:ring-2 focus:ring-gold"
                        />
                        {query && (
                            <button type="button" onClick={() => { setQuery(""); setResults(null); }} aria-label="Clear search" data-testid="help-search-clear" className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-k hover:text-primary-k">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </section>

                {/* Search results */}
                {query.trim() && (
                    <section className="mx-auto max-w-5xl px-6 pb-10" data-testid="help-search-results">
                        <p className="text-sm text-muted-k mb-4" data-testid="help-search-count">
                            {searching ? "Searching…" : `${(results || []).length} result${(results || []).length === 1 ? "" : "s"} for "${query.trim()}"`}
                        </p>
                        {!searching && (results || []).length === 0 && (
                            <div className="rounded-2xl border border-kindred bg-surface p-8 text-center" data-testid="help-search-empty">
                                <p className="text-primary-k font-medium">We couldn't find an article for that.</p>
                                <p className="mt-1 text-sm text-muted-k">Try a different word, browse the categories below, or ask Wayly directly.</p>
                                <div className="mt-4 flex flex-wrap justify-center gap-2">
                                    <Link to="/ask-wayly" className="inline-flex items-center gap-2 rounded-lg bg-primary-k text-white px-4 py-2 text-sm font-semibold">Ask Wayly</Link>
                                    <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg bg-surface text-primary-k border border-kindred px-4 py-2 text-sm font-semibold">Contact support</Link>
                                </div>
                            </div>
                        )}
                        <div className="grid sm:grid-cols-2 gap-4">
                            {(results || []).map((a) => <ArticleCard key={a.slug} a={a} />)}
                        </div>
                    </section>
                )}

                {/* Categories + popular (hidden while searching) */}
                {!query.trim() && (
                    <>
                        <section className="mx-auto max-w-5xl px-6 pb-4" data-testid="help-categories">
                            <h2 className="font-heading text-2xl text-primary-k tracking-tight">Browse by Topic</h2>
                            {categories === null ? (
                                <p className="mt-4 text-sm text-muted-k">Loading…</p>
                            ) : activeCategories.length === 0 ? (
                                <div className="mt-4 rounded-2xl border border-kindred bg-surface p-8 text-center" data-testid="help-categories-empty">
                                    <p className="text-primary-k font-medium">Our Help Centre is getting ready.</p>
                                    <p className="mt-1 text-sm text-muted-k">In the meantime, browse the <Link to="/faq" className="underline text-primary-k">FAQ</Link> or ask Wayly directly.</p>
                                </div>
                            ) : (
                                <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {activeCategories.map((c) => (
                                        <Link key={c.slug} to={`/help/c/${c.slug}`} data-testid={`help-category-${c.slug}`}
                                            className="block bg-surface border border-kindred rounded-2xl p-5 hover:border-[#2BC4D6] transition-colors">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-heading text-lg text-primary-k">{c.label}</h3>
                                                <ChevronRight className="h-4 w-4 text-muted-k" />
                                            </div>
                                            <p className="mt-2 text-xs text-muted-k">{c.count} article{c.count === 1 ? "" : "s"}</p>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </section>

                        {popular.length > 0 && (
                            <section className="mx-auto max-w-5xl px-6 pt-6 pb-16" data-testid="help-popular">
                                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Popular Articles</h2>
                                <div className="mt-5 grid sm:grid-cols-2 gap-4">
                                    {popular.map((a) => <ArticleCard key={a.slug} a={a} />)}
                                </div>
                            </section>
                        )}

                        <section className="mx-auto max-w-5xl px-6 pb-20" data-testid="help-still-stuck">
                            <div className="rounded-2xl border border-kindred bg-surface p-6">
                                <h2 className="font-heading text-xl text-primary-k">Still Stuck?</h2>
                                <p className="mt-2 text-sm text-muted-k">Ask Wayly for a plain-English answer, or send our team a question.</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Link to="/ask-wayly" data-testid="help-cta-ask" className="inline-flex items-center gap-2 rounded-lg bg-primary-k hover:bg-[#091D33] text-white px-5 py-2.5 text-sm font-semibold"><MessageCircle className="h-4 w-4" /> Ask Wayly</Link>
                                    <Link to="/contact" data-testid="help-cta-contact" className="inline-flex items-center gap-2 rounded-lg bg-surface text-primary-k border border-kindred px-5 py-2.5 text-sm font-semibold hover:border-[#A5512B]">Contact support</Link>
                                    <Link to="/faq" data-testid="help-cta-faq" className="inline-flex items-center gap-2 rounded-lg bg-surface text-primary-k border border-kindred px-5 py-2.5 text-sm font-semibold hover:border-[#A5512B]">Browse the FAQ</Link>
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </main>
            <Footer />
        </div>
    );
}

function ArticleCard({ a }) {
    return (
        <Link to={`/help/a/${a.slug}`} data-testid={`help-article-card-${a.slug}`}
            className="block bg-surface border border-kindred rounded-2xl p-5 hover:border-[#2BC4D6] transition-colors">
            {a.category_label && <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted-k">{a.category_label}</span>}
            <h3 className="font-heading text-lg text-primary-k mt-2">{a.title}</h3>
            <p className="mt-2 text-sm text-muted-k leading-relaxed">{a.summary}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k">Read <ArrowRight className="h-3.5 w-3.5" /></span>
        </Link>
    );
}

// ---------------------------------------------------------------------------
// Category listing
// ---------------------------------------------------------------------------
export function HelpCategory() {
    const { category } = useParams();
    const [articles, setArticles] = useState(null);
    const [meta, setMeta] = useState(null);

    useEffect(() => {
        axios.get(`${API}/public/help/articles`, { params: { category, limit: 100 } })
            .then((r) => setArticles(r.data.articles || []))
            .catch(() => setArticles([]));
        axios.get(`${API}/public/help/categories`)
            .then((r) => setMeta((r.data.categories || []).find((c) => c.slug === category) || null))
            .catch(() => setMeta(null));
    }, [category]);

    const label = meta?.label || "Help";
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead title={`${label} | Wayly Help Centre`} description={`Wayly help articles about ${label}.`} path={`/help/c/${category}`} />
            <MarketingHeader />
            <main id="main-content">
                <section className="mx-auto max-w-5xl px-6 pt-12 pb-6" data-testid="help-category-page">
                    <Link to="/help" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Help Centre</Link>
                    <h1 className="font-heading text-4xl text-primary-k tracking-tight mt-4 leading-tight" data-testid="help-category-h1">{label}</h1>
                </section>
                <section className="mx-auto max-w-5xl px-6 pb-20 grid sm:grid-cols-2 gap-4">
                    {articles === null ? (
                        <p className="text-sm text-muted-k">Loading…</p>
                    ) : articles.length === 0 ? (
                        <div className="sm:col-span-2 rounded-2xl border border-kindred bg-surface p-8 text-center" data-testid="help-category-empty">
                            <p className="text-muted-k">No articles here yet. <Link to="/help" className="underline text-primary-k">Back to Help Centre</Link></p>
                        </div>
                    ) : articles.map((a) => <ArticleCard key={a.slug} a={a} />)}
                </section>
            </main>
            <Footer />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Article detail
// ---------------------------------------------------------------------------
export function HelpArticle() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState(undefined); // undefined=loading, null=not found

    useEffect(() => {
        setArticle(undefined);
        axios.get(`${API}/public/help/articles/${slug}`)
            .then((r) => setArticle(r.data))
            .catch(() => setArticle(null));
    }, [slug]);

    if (article === undefined) {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-3xl px-6 py-20 text-center text-muted-k" data-testid="help-article-loading">Loading…</div>
                <Footer />
            </div>
        );
    }
    if (!article) {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-3xl px-6 py-20 text-center" data-testid="help-article-notfound">
                    <h1 className="font-heading text-3xl text-primary-k">Article not found</h1>
                    <button onClick={() => navigate("/help")} className="mt-4 inline-flex items-center gap-1 text-primary-k underline">Back to Help Centre</button>
                </div>
                <Footer />
            </div>
        );
    }

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [breadcrumbLd([
            { name: "Home", url: "/" },
            { name: "Help Centre", url: "/help" },
            { name: article.category_label || "Help", url: `/help/c/${article.category}` },
            { name: article.title, url: `/help/a/${slug}` },
        ])],
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title={`${article.meta_title || article.title} | Wayly Help`}
                description={article.meta_description || article.summary}
                path={`/help/a/${slug}`}
                type="article"
                updatedAt={article.updated_at}
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
                <article className="mx-auto max-w-3xl px-6 pt-12 pb-12" data-testid={`help-article-${slug}`}>
                    <nav className="flex items-center gap-1.5 text-sm text-muted-k flex-wrap" aria-label="Breadcrumb">
                        <Link to="/help" className="hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Help Centre</Link>
                        <span aria-hidden>/</span>
                        <Link to={`/help/c/${article.category}`} className="hover:text-primary-k">{article.category_label}</Link>
                    </nav>
                    <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight">{article.title}</h1>
                    <p className="mt-4 text-lg text-muted-k leading-relaxed">{article.summary}</p>
                    {article.last_reviewed_at && (
                        <p className="mt-3 text-xs text-muted-k" data-testid="help-article-reviewed">Last reviewed {fmtDate(article.last_reviewed_at)}</p>
                    )}

                    <div className="mt-8 prose prose-lg max-w-none text-primary-k leading-loose
                        [&_h2]:font-heading [&_h2]:text-2xl [&_h2]:text-primary-k [&_h2]:mt-10 [&_h2]:mb-3
                        [&_h3]:font-heading [&_h3]:text-xl [&_h3]:mt-8 [&_h3]:mb-2
                        [&_p]:my-4 [&_a]:underline [&_a]:text-primary-k
                        [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1
                        [&_table]:w-full [&_table]:my-6 [&_table]:border-collapse
                        [&_th]:bg-surface-2 [&_th]:text-left [&_th]:text-primary-k [&_th]:font-semibold [&_th]:p-3 [&_th]:border [&_th]:border-kindred
                        [&_td]:p-3 [&_td]:border [&_td]:border-kindred [&_td]:align-top
                        [&_blockquote]:border-l-4 [&_blockquote]:border-gold [&_blockquote]:pl-4 [&_blockquote]:italic" data-testid="help-article-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body_md || ""}</ReactMarkdown>
                    </div>

                    <HelpFeedback slug={slug} />

                    {(article.related || []).length > 0 && (
                        <section className="mt-12 pt-8 border-t border-kindred" data-testid="help-article-related">
                            <h2 className="font-heading text-xl text-primary-k inline-flex items-center gap-2"><BookOpen className="h-5 w-5" /> Related Articles</h2>
                            <div className="mt-4 grid sm:grid-cols-2 gap-4">
                                {article.related.map((r) => (
                                    <Link key={r.slug} to={`/help/a/${r.slug}`} data-testid={`help-related-${r.slug}`} className="block bg-surface border border-kindred rounded-2xl p-5 hover:border-[#2BC4D6] transition-colors">
                                        <h3 className="font-heading text-base text-primary-k">{r.title}</h3>
                                        <p className="mt-2 text-sm text-muted-k leading-relaxed">{r.summary}</p>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                </article>
            </main>
            <Footer />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Anonymous helpful / not-helpful + optional private comment
// ---------------------------------------------------------------------------
function HelpFeedback({ slug }) {
    const [choice, setChoice] = useState(null); // true | false | null
    const [comment, setComment] = useState("");
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const submit = async (helpful, withComment) => {
        setBusy(true); setError("");
        try {
            await axios.post(`${API}/public/help/articles/${slug}/feedback`, {
                helpful,
                comment: withComment ? (comment.trim() || undefined) : undefined,
            });
            setDone(true);
        } catch (e) {
            const d = e?.response?.data?.detail;
            setError(typeof d === "string" ? d : (d?.message || "Sorry, that didn't go through. Please try again."));
        } finally { setBusy(false); }
    };

    if (done) {
        return (
            <div className="mt-12 rounded-2xl border border-kindred bg-surface-2 p-5 text-center" data-testid="help-feedback-done">
                <p className="text-sm text-primary-k font-medium">Thanks for the feedback.</p>
            </div>
        );
    }

    return (
        <div className="mt-12 rounded-2xl border border-kindred bg-surface p-5" data-testid="help-feedback">
            <p className="text-sm font-medium text-primary-k">Was this article helpful?</p>
            <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={() => setChoice(true)} aria-pressed={choice === true} data-testid="help-feedback-yes"
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${choice === true ? "bg-primary-k text-white border-primary-k" : "bg-surface text-primary-k border-kindred hover:border-primary-k"}`}>
                    <ThumbsUp className="h-4 w-4" /> Yes
                </button>
                <button type="button" onClick={() => setChoice(false)} aria-pressed={choice === false} data-testid="help-feedback-no"
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${choice === false ? "bg-[#A5512B] text-white border-[#A5512B]" : "bg-surface text-primary-k border-kindred hover:border-[#A5512B]"}`}>
                    <ThumbsDown className="h-4 w-4" /> No
                </button>
            </div>

            {choice !== null && (
                <div className="mt-4" data-testid="help-feedback-comment-wrap">
                    <label htmlFor="help-feedback-comment" className="text-sm text-muted-k">
                        {choice ? "Anything we got especially right? (optional)" : "What was missing or unclear? (optional)"}
                    </label>
                    <textarea
                        id="help-feedback-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        data-testid="help-feedback-comment"
                        className="mt-2 w-full rounded-xl border border-kindred bg-surface px-3 py-2 text-sm text-primary-k focus:outline-none focus:ring-2 focus:ring-gold"
                        placeholder="Your comment (optional)"
                    />
                    <p className="mt-2 text-xs text-muted-k" data-testid="help-feedback-privacy">
                        Please don't include personal or sensitive aged-care information (names, health details, account numbers). Comments are read privately by our team to improve this article.
                    </p>
                    {error && <p className="mt-2 text-xs text-[#B42318]" data-testid="help-feedback-error">{error}</p>}
                    <div className="mt-3 flex gap-2">
                        <button type="button" disabled={busy} onClick={() => submit(choice, true)} data-testid="help-feedback-submit"
                            className="inline-flex items-center gap-2 rounded-lg bg-primary-k text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                            {busy ? "Sending…" : "Send feedback"}
                        </button>
                        <button type="button" disabled={busy} onClick={() => setChoice(null)} className="inline-flex items-center rounded-lg bg-surface text-muted-k border border-kindred px-4 py-2 text-sm">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}
