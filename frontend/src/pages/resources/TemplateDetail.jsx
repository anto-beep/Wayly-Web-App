import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { getTemplateBySlug, titleCaseHeading, ESCALATION_LADDER, TEMPLATES_LIBRARY } from "@/data/templatesLibrary";
import SeoHead, { canonicalFor } from "@/seo/SeoHead";
import { ArrowLeft, ArrowRight, Copy, Download, Check, ShieldAlert, ChevronDown, FileText, ExternalLink, ArrowUpRight, ListChecks, PhoneCall, Printer } from "lucide-react";

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }); } catch { return iso; } };

// Split a letter/checklist body on [merge fields] and highlight them. Copy and
// DOCX download keep the brackets but drop the highlight styling.
function highlightMergeFields(text) {
    const parts = String(text).split(/(\[[^\]]*\])/g);
    return parts.map((p, i) =>
        /^\[[^\]]*\]$/.test(p)
            ? <mark key={i} className="bg-gold/25 text-primary-k rounded px-0.5" data-testid="merge-field">{p}</mark>
            : <React.Fragment key={i}>{p}</React.Fragment>
    );
}

function buildDocBlob(text) {
    const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><pre style="font-family:Calibri,Arial,sans-serif;font-size:11pt;white-space:pre-wrap;">${esc}</pre></body></html>`;
    return new Blob(["\ufeff", html], { type: "application/msword" });
}

function DocActions({ text, filename, pdfTitle }) {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
    };
    const onDownload = () => {
        const url = URL.createObjectURL(buildDocBlob(text));
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    const onPdf = () => {
        const w = window.open("", "_blank", "width=820,height=920");
        if (!w) return;
        const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const title = String(pdfTitle || "Wayly template").replace(/</g, "&lt;");
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4;margin:20mm;}body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.55;}h1{font-family:Arial,Helvetica,sans-serif;font-size:18pt;color:#0E4D52;margin:0 0 18px;}pre{white-space:pre-wrap;font-family:inherit;font-size:12pt;margin:0;}.foot{margin-top:28px;font-size:9pt;color:#666;border-top:1px solid #ccc;padding-top:8px;}</style></head><body><h1>${title}</h1><pre>${esc}</pre><div class="foot">Prepared with Wayly · wayly.com.au · General information, not financial, legal or clinical advice.</div></body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 350);
    };
    return (
        <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onCopy} data-testid="template-copy-btn" className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-4 py-2 text-sm font-medium text-primary-k hover:bg-surface-2 transition-colors">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy text"}
            </button>
            <button type="button" onClick={onDownload} data-testid="template-docx-btn" className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-4 py-2 text-sm font-medium text-primary-k hover:bg-surface-2 transition-colors">
                <Download className="h-4 w-4" /> Download (DOCX)
            </button>
            <button type="button" onClick={onPdf} data-testid="template-pdf-btn" className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-4 py-2 text-sm font-medium text-primary-k hover:bg-surface-2 transition-colors">
                <Printer className="h-4 w-4" /> Print / PDF
            </button>
        </div>
    );
}

function LetterBlock({ title, body, slug, pdfTitle }) {
    return (
        <section className="mt-10" data-testid="template-letter">
            <h2 className="font-heading text-2xl text-primary-k tracking-tight">{title}</h2>
            <DocActions text={body} filename={`${slug}.doc`} pdfTitle={pdfTitle} />
            <div className="mt-4 rounded-2xl border border-kindred bg-surface-2 p-5 font-mono text-sm leading-relaxed text-primary-k whitespace-pre-wrap" data-testid="template-letter-body">
                {highlightMergeFields(body)}
            </div>
            <p className="mt-2 text-xs text-muted-k">Anything in [square brackets] is a prompt to fill in. The copy, download and print buttons keep the brackets so you can find them.</p>
        </section>
    );
}

function ChecklistBlock({ title, items, slug, pdfTitle }) {
    const text = `${title}\n\n${items.map((i) => `[ ] ${i}`).join("\n")}`;
    return (
        <section className="mt-10" data-testid="template-checklist">
            <h2 className="font-heading text-2xl text-primary-k tracking-tight flex items-center gap-2"><ListChecks className="h-5 w-5 text-gold" /> {title}</h2>
            <DocActions text={text} filename={`${slug}.doc`} pdfTitle={`${pdfTitle} — ${title}`} />
            <ul className="mt-4 space-y-2">
                {items.map((it, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-kindred bg-surface p-3 text-sm text-primary-k leading-relaxed">
                        <span className="mt-0.5 h-4 w-4 flex-none rounded border border-muted-k" aria-hidden="true" />
                        <span>{it}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function QuestionsBlock({ title, items, slug, pdfTitle }) {
    const text = `${title}\n\n${items.map((i, n) => `${n + 1}. ${i}`).join("\n")}`;
    return (
        <section className="mt-10" data-testid="template-questions">
            <h2 className="font-heading text-2xl text-primary-k tracking-tight">{title}</h2>
            <DocActions text={text} filename={`${slug}.doc`} pdfTitle={`${pdfTitle} — ${title}`} />
            <ol className="mt-4 list-decimal pl-6 space-y-2 text-sm text-primary-k leading-relaxed">
                {items.map((it, i) => <li key={i}>{it}</li>)}
            </ol>
        </section>
    );
}

function ProseBlock({ title, md }) {
    return (
        <section className="mt-10" data-testid="template-prose">
            {title && <h2 className="font-heading text-2xl text-primary-k tracking-tight">{title}</h2>}
            <div className="mt-3 prose prose-lg max-w-none text-primary-k leading-relaxed
                [&_p]:my-3 [&_a]:underline [&_a]:text-primary-k
                [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6
                [&_table]:w-full [&_table]:my-4 [&_table]:border-collapse
                [&_th]:bg-surface-2 [&_th]:text-left [&_th]:text-primary-k [&_th]:font-semibold [&_th]:p-3 [&_th]:border [&_th]:border-kindred
                [&_td]:p-3 [&_td]:border [&_td]:border-kindred [&_td]:align-top">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
            </div>
        </section>
    );
}

function NoteBlock({ title, md }) {
    return (
        <aside className="mt-10 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-5" data-testid="template-note">
            <h2 className="font-heading text-lg text-amber-900 m-0 flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> {title}</h2>
            <div className="mt-2 text-sm text-amber-900 leading-relaxed [&_p]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
            </div>
        </aside>
    );
}

function EscalationLadder() {
    return (
        <section className="mt-12 rounded-2xl border border-kindred bg-surface p-6" data-testid="template-escalation">
            <h2 className="font-heading text-2xl text-primary-k tracking-tight flex items-center gap-2"><PhoneCall className="h-5 w-5 text-gold" /> If It Isn't Resolved: The Escalation Ladder</h2>
            <ol className="mt-4 list-decimal pl-6 space-y-3 text-sm text-primary-k leading-relaxed">
                {ESCALATION_LADDER.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
        </section>
    );
}

function ToolCTA({ tool }) {
    if (!tool) return null;
    const label = tool.cta || `Use the ${tool.name} to ${tool.anchor}`;
    return (
        <Link to={tool.url} data-testid="template-tool-cta" className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-[#2BC4D6] bg-surface p-5 hover:bg-surface-2 transition-colors">
            <span className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-[#E6F8FB] flex items-center justify-center flex-none"><ArrowUpRight className="h-5 w-5 text-[#1565B8]" /></span>
                <span>
                    <span className="block font-heading text-base text-primary-k">{tool.name}</span>
                    <span className="block text-sm text-muted-k">{label}</span>
                </span>
            </span>
            <ArrowRight className="h-5 w-5 text-[#1565B8] flex-none" />
        </Link>
    );
}

function FAQAccordion({ faqs }) {
    const [open, setOpen] = useState(null);
    return (
        <section className="mt-12" data-testid="template-faq">
            <h2 className="font-heading text-2xl text-primary-k tracking-tight">Frequently Asked Questions</h2>
            <dl className="mt-5 divide-y divide-kindred border border-kindred rounded-2xl bg-surface overflow-hidden">
                {faqs.map((f, i) => {
                    const isOpen = open === i;
                    return (
                        <div key={i}>
                            <dt>
                                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="w-full flex items-center justify-between text-left p-4 hover:bg-surface-2" data-testid={`template-faq-q-${i}`}>
                                    <span className="font-medium text-primary-k">{f.q}</span>
                                    <ChevronDown className={`h-4 w-4 text-muted-k flex-none transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                </button>
                            </dt>
                            {isOpen && <dd className="px-4 pb-4 text-sm text-primary-k leading-relaxed" data-testid={`template-faq-a-${i}`}>{f.a}</dd>}
                        </div>
                    );
                })}
            </dl>
        </section>
    );
}

export default function TemplateDetail() {
    const { slug } = useParams();
    const t = getTemplateBySlug(slug);

    if (!t) {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-3xl px-6 py-20 text-center">
                    <h1 className="font-heading text-3xl text-primary-k">Template not found</h1>
                    <Link to="/resources/templates" className="mt-4 inline-flex items-center gap-1 text-primary-k underline">Back to Templates</Link>
                </div>
                <Footer />
            </div>
        );
    }

    const url = canonicalFor(`/resources/templates/${t.slug}`);
    const related = (t.relatedSlugs || []).map(getTemplateBySlug).filter(Boolean);

    const graph = [
        {
            "@type": "Article",
            "@id": `${url}#article`,
            headline: t.h1,
            description: t.metaDescription,
            inLanguage: "en-AU",
            datePublished: t.datePublished,
            dateModified: t.dateModified,
            author: { "@type": "Organization", name: "Wayly Editorial" },
            publisher: { "@type": "Organization", name: "Wayly", logo: { "@type": "ImageObject", url: canonicalFor("/logo.png") } },
            mainEntityOfPage: url,
            about: [{ "@type": "Thing", name: "Support at Home" }],
            isAccessibleForFree: true,
        },
        {
            "@type": "FAQPage",
            mainEntity: (t.faqs || []).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        },
        {
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: canonicalFor("/") },
                { "@type": "ListItem", position: 2, name: "Resources", item: canonicalFor("/resources") },
                { "@type": "ListItem", position: 3, name: "Templates", item: canonicalFor("/resources/templates") },
                { "@type": "ListItem", position: 4, name: t.name, item: url },
            ],
        },
    ];
    if (t.howToSteps?.length) {
        graph.push({
            "@type": "HowTo",
            name: `How to use the ${t.name}`,
            step: t.howToSteps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
        });
    }
    const jsonLd = { "@context": "https://schema.org", "@graph": graph };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title={t.titleTag}
                description={t.metaDescription}
                path={`/resources/templates/${t.slug}`}
                type="article"
                publishedAt={t.datePublished}
                updatedAt={t.dateModified}
                author="Wayly Editorial"
                jsonLd={[jsonLd]}
            />
            <MarketingHeader />
            <article className="mx-auto max-w-3xl px-6 pt-12 pb-12" data-testid={`template-detail-${t.slug}`}>
                <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-k" aria-label="Breadcrumb">
                    <Link to="/resources" className="hover:text-primary-k">Resources</Link><span>/</span>
                    <Link to="/resources/templates" className="hover:text-primary-k">Templates</Link><span>/</span>
                    <span className="text-primary-k">{t.cluster}</span>
                </nav>
                <span className="overline mt-6 block">{t.cluster} Template</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight mt-4 leading-tight">{titleCaseHeading(t.h1)}</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">{t.intro}</p>

                {t.disclaimer && (
                    <p className="mt-5 inline-flex items-start gap-2 rounded-xl border border-kindred bg-surface-2 px-4 py-2.5 text-sm text-muted-k" data-testid="template-disclaimer">
                        <ShieldAlert className="h-4 w-4 mt-0.5 flex-none" /> General information, not financial, legal or clinical advice.
                    </p>
                )}

                {(t.blocks || []).map((b, i) => {
                    const heading = titleCaseHeading(b.title);
                    if (b.type === "letter") return <LetterBlock key={i} title={heading} body={b.body} slug={t.slug} pdfTitle={t.name} />;
                    if (b.type === "checklist") return <ChecklistBlock key={i} title={heading} items={b.items} slug={t.slug} pdfTitle={t.name} />;
                    if (b.type === "questions") return <QuestionsBlock key={i} title={heading} items={b.items} slug={t.slug} pdfTitle={t.name} />;
                    if (b.type === "note") return <NoteBlock key={i} title={heading} md={b.md} />;
                    return <ProseBlock key={i} title={heading} md={b.md} />;
                })}

                {t.showEscalationLadder && <EscalationLadder />}

                <ToolCTA tool={t.tool} />

                {t.externalLinks?.length > 0 && (
                    <section className="mt-10" data-testid="template-external-links">
                        <h2 className="font-heading text-xl text-primary-k">Official Forms And Links</h2>
                        <ul className="mt-3 space-y-2 text-sm">
                            {t.externalLinks.map((l, i) => (
                                <li key={i}><a href={l.href} target="_blank" rel="noopener noreferrer" className="text-primary-k underline inline-flex items-center gap-1">{l.label} <ExternalLink className="h-3 w-3" /></a></li>
                            ))}
                        </ul>
                    </section>
                )}

                {t.faqs?.length > 0 && <FAQAccordion faqs={t.faqs} />}

                {related.length > 0 && (
                    <section className="mt-12 pt-8 border-t border-kindred" data-testid="template-related">
                        <h2 className="font-heading text-xl text-primary-k">Related Templates</h2>
                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            {related.map((r) => (
                                <Link key={r.slug} to={`/resources/templates/${r.slug}`} className="block bg-surface border border-kindred rounded-2xl p-5 hover:border-[#2BC4D6] transition-colors" data-testid={`template-related-${r.slug}`}>
                                    <div className="flex items-start gap-3">
                                        <FileText className="h-4 w-4 text-primary-k mt-1 flex-none" />
                                        <h3 className="font-heading text-base text-primary-k">{titleCaseHeading(r.name)}</h3>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-k leading-relaxed">{r.cardDesc}</p>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <footer className="mt-12 pt-6 border-t border-kindred text-xs text-muted-k space-y-1" data-testid="template-last-checked">
                    <p>Facts on this page last checked {t.lastChecked}{t.sources?.length ? ` against ${t.sources.join(", ")}` : ""}.</p>
                    <p>Last updated {fmtDate(t.dateModified)} · Wayly Editorial. If you find an error, email <a href="mailto:support@wayly.com.au" className="underline">support@wayly.com.au</a>.</p>
                </footer>

                <Link to="/resources/templates" className="mt-10 inline-flex items-center gap-1 text-sm text-primary-k"><ArrowLeft className="h-3.5 w-3.5" /> All templates</Link>
            </article>
            <Footer />
        </div>
    );
}
