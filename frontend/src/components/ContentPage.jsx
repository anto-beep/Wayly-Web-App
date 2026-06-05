import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import AIAccuracyBanner from "@/components/AIAccuracyBanner";
import SeoHead from "@/seo/SeoHead";

/**
 * ContentPage — shared layout for Phase 4 SEO pages
 * (services, policy explainers, guides, FAQ entries, /about, /ask-wayly).
 *
 * Renders:
 *   • SEO meta (title, description, canonical) via <SeoHead>
 *   • Optional JSON-LD breadcrumb + article schema
 *   • Crumb trail, H1, intro paragraph
 *   • A "What this page covers" key-takeaway list (Answer Engine signal)
 *   • Body sections (heading + markdown-like paragraphs)
 *   • Optional FAQ block (FAQPage schema)
 *   • Related links footer
 *   • Trust line (byline + reviewer placeholder + updated date)
 *
 * Designed to be lazy-loaded so the marketing bundle stays small.
 */
function renderInline(text) {
    // Very small inline parser: **bold** + [text](url) only. Plain paragraphs otherwise.
    const parts = [];
    let remaining = text;
    let key = 0;
    while (remaining.length > 0) {
        const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
        const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
        const linkIdx = linkMatch ? remaining.indexOf(linkMatch[0]) : Infinity;
        const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;
        if (linkIdx === Infinity && boldIdx === Infinity) {
            parts.push(<span key={key++}>{remaining}</span>);
            break;
        }
        if (linkIdx < boldIdx) {
            if (linkIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, linkIdx)}</span>);
            const url = linkMatch[2];
            const internal = url.startsWith("/");
            parts.push(internal ? (
                <Link key={key++} to={url} className="text-[#075866] font-medium underline underline-offset-2 decoration-2">{linkMatch[1]}</Link>
            ) : (
                <a key={key++} href={url} target="_blank" rel="noreferrer noopener" className="text-[#075866] font-medium underline underline-offset-2 decoration-2">{linkMatch[1]}</a>
            ));
            remaining = remaining.slice(linkIdx + linkMatch[0].length);
        } else {
            if (boldIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, boldIdx)}</span>);
            parts.push(<strong key={key++} className="font-semibold text-[#0E2A47]">{boldMatch[1]}</strong>);
            remaining = remaining.slice(boldIdx + boldMatch[0].length);
        }
    }
    return parts;
}

function Paragraph({ children }) {
    return <p className="text-[15px] leading-relaxed text-[#3C4A5E] mt-3">{renderInline(children)}</p>;
}

function BulletList({ items }) {
    return (
        <ul className="mt-3 space-y-2 text-[15px] text-[#3C4A5E] leading-relaxed list-none pl-0">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2BC4D6] shrink-0" aria-hidden />
                    <span>{renderInline(item)}</span>
                </li>
            ))}
        </ul>
    );
}

function buildJsonLd({ title, description, url, faqs, breadcrumbs, updatedAt }) {
    const graph = [];
    if (breadcrumbs?.length) {
        graph.push({
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbs.map((b, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: b.label,
                item: b.href ? `https://wayly.com.au${b.href}` : undefined,
            })),
        });
    }
    graph.push({
        "@type": "Article",
        headline: title,
        description,
        author: { "@type": "Person", name: "Antony Chiware" },
        publisher: { "@type": "Organization", name: "Wayly", url: "https://wayly.com.au" },
        url: `https://wayly.com.au${url}`,
        dateModified: updatedAt || "2026-06-05",
    });
    if (faqs?.length) {
        graph.push({
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
        });
    }
    return { "@context": "https://schema.org", "@graph": graph };
}

export default function ContentPage({
    title,
    description,
    url,
    breadcrumbs = [],
    overline,
    h1,
    intro,
    keyTakeaways = [],
    sections = [],
    faqs = [],
    related = [],
    showAiBanner = false,
    updatedAt = "5 June 2026",
}) {
    const jsonLd = buildJsonLd({ title, description, url, faqs, breadcrumbs, updatedAt });
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead title={title} description={description} canonical={`https://wayly.com.au${url}`} jsonLd={jsonLd} />
            <MarketingHeader />

            <main id="main-content">
            <article className="mx-auto max-w-3xl px-6 pt-10 pb-16">
                {breadcrumbs.length > 0 && (
                    <nav aria-label="Breadcrumb" className="text-xs text-[#4A5A75] flex flex-wrap items-center gap-1.5" data-testid="content-breadcrumbs">
                        {breadcrumbs.map((b, i) => (
                            <React.Fragment key={i}>
                                {b.href ? (
                                    <Link to={b.href} className="hover:text-[#1565B8]">{b.label}</Link>
                                ) : (
                                    <span className="text-[#0E2A47]">{b.label}</span>
                                )}
                                {i < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3 text-[#CFE0F0]" />}
                            </React.Fragment>
                        ))}
                    </nav>
                )}

                {overline && (
                    <div className="mt-6">
                        <span className="overline" data-testid="content-overline">{overline}</span>
                    </div>
                )}

                <h1 className="font-heading text-4xl sm:text-5xl text-[#0E2A47] mt-3 leading-tight tracking-tight" data-testid="content-h1">
                    {h1}
                </h1>

                {intro && <Paragraph>{intro}</Paragraph>}

                {keyTakeaways.length > 0 && (
                    <div className="mt-8 rounded-2xl border border-[#CFE0F0] bg-white p-5" data-testid="content-key-takeaways">
                        <div className="text-[11px] uppercase tracking-wider text-[#075866] font-semibold">What this page covers</div>
                        <BulletList items={keyTakeaways} />
                    </div>
                )}

                {showAiBanner && (
                    <div className="mt-6">
                        <AIAccuracyBanner />
                    </div>
                )}

                {sections.map((s, i) => (
                    <section key={i} className="mt-10" data-testid={`content-section-${i}`}>
                        {s.heading && <h2 className="font-heading text-2xl sm:text-3xl text-[#0E2A47] tracking-tight">{s.heading}</h2>}
                        {s.paragraphs?.map((p, j) => <Paragraph key={j}>{p}</Paragraph>)}
                        {s.bullets && <BulletList items={s.bullets} />}
                        {s.note && (
                            <div className="mt-4 rounded-xl border border-[#CFE0F0] bg-[#F4FAFE] p-4 text-[14px] text-[#0E2A47]" data-testid={`content-section-note-${i}`}>
                                {renderInline(s.note)}
                            </div>
                        )}
                    </section>
                ))}

                {faqs.length > 0 && (
                    <section className="mt-12" data-testid="content-faqs">
                        <h2 className="font-heading text-2xl sm:text-3xl text-[#0E2A47] tracking-tight">Frequently asked questions</h2>
                        <div className="mt-5 divide-y divide-[#CFE0F0] border-y border-[#CFE0F0]">
                            {faqs.map((f, i) => (
                                <details key={i} className="group py-4" data-testid={`content-faq-${i}`}>
                                    <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-[#0E2A47] font-semibold">
                                        <span>{f.q}</span>
                                        <ChevronRight className="h-4 w-4 mt-1 text-[#4A5A75] group-open:rotate-90 transition-transform" aria-hidden />
                                    </summary>
                                    <div className="mt-3 text-[15px] leading-relaxed text-[#3C4A5E]">
                                        {renderInline(f.a)}
                                    </div>
                                </details>
                            ))}
                        </div>
                    </section>
                )}

                {related.length > 0 && (
                    <section className="mt-12" data-testid="content-related">
                        <h2 className="font-heading text-2xl text-[#0E2A47] tracking-tight">Related on Wayly</h2>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                            {related.map((r, i) => (
                                <Link
                                    key={i}
                                    to={r.href}
                                    className="group flex items-start gap-2 rounded-xl border border-[#CFE0F0] bg-white p-4 hover:border-[#2BC4D6] hover:-translate-y-0.5 transition-all"
                                    data-testid={`content-related-${i}`}
                                >
                                    <div className="flex-1">
                                        <div className="text-[#0E2A47] font-semibold text-sm">{r.label}</div>
                                        {r.sub && <div className="text-xs text-[#4A5A75] mt-1">{r.sub}</div>}
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-[#1565B8] mt-1 group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <footer className="mt-12 pt-6 border-t border-[#CFE0F0] text-xs text-[#4A5A75]" data-testid="content-trust">
                    Written by Antony Chiware. Reviewed by: To be confirmed. Updated {updatedAt}. Spot something wrong? Email <a href="mailto:hello@wayly.com.au" className="text-[#075866] font-medium underline underline-offset-2">hello@wayly.com.au</a>.
                </footer>
            </article>
            </main>

            <Footer />
        </div>
    );
}
