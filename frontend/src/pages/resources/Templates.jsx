import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { TEMPLATES_LIBRARY, TEMPLATE_CLUSTERS, titleCaseHeading } from "@/data/templatesLibrary";
import { ArrowLeft, ArrowRight, FileText, Search, X } from "lucide-react";
import SeoHead, { canonicalFor } from "@/seo/SeoHead";

export default function Templates() {
    const [cluster, setCluster] = useState("All");
    const [query, setQuery] = useState("");

    const q = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        return TEMPLATES_LIBRARY.filter((t) => {
            if (cluster !== "All" && t.cluster !== cluster) return false;
            if (!q) return true;
            const hay = `${t.name} ${t.cardDesc} ${t.cluster} ${t.tool?.name || ""} ${t.slug}`.toLowerCase();
            return hay.includes(q);
        });
    }, [cluster, q]);

    const grouped = useMemo(() => {
        const byCluster = {};
        TEMPLATE_CLUSTERS.forEach((c) => { byCluster[c.id] = []; });
        filtered.forEach((t) => { (byCluster[t.cluster] = byCluster[t.cluster] || []).push(t); });
        return byCluster;
    }, [filtered]);

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "@id": canonicalFor("/resources/templates") + "#page",
                url: canonicalFor("/resources/templates"),
                name: "Aged Care Letter Templates And Checklists",
                inLanguage: "en-AU",
                mainEntity: { "@id": canonicalFor("/resources/templates") + "#list" },
            },
            {
                "@type": "ItemList",
                "@id": canonicalFor("/resources/templates") + "#list",
                numberOfItems: TEMPLATES_LIBRARY.length,
                itemListElement: TEMPLATES_LIBRARY.map((t, i) => ({
                    "@type": "ListItem", position: i + 1, name: t.name,
                    url: canonicalFor(`/resources/templates/${t.slug}`),
                })),
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: canonicalFor("/") },
                    { "@type": "ListItem", position: 2, name: "Resources", item: canonicalFor("/resources") },
                    { "@type": "ListItem", position: 3, name: "Templates", item: canonicalFor("/resources/templates") },
                ],
            },
        ],
    };

    const activeClusters = cluster === "All"
        ? TEMPLATE_CLUSTERS.filter((c) => (grouped[c.id] || []).length > 0)
        : TEMPLATE_CLUSTERS.filter((c) => c.id === cluster && (grouped[c.id] || []).length > 0);

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Aged Care Letter Templates And Checklists"
                description="Free Australian aged care letter and checklist templates: statement queries, invoice disputes, reassessment requests, complaints and family planning. Copy or download."
                path="/resources/templates"
                jsonLd={[jsonLd]}
            />
            <MarketingHeader />
            <section className="mx-auto max-w-5xl px-6 pt-12 pb-6" data-testid="templates-page">
                <Link to="/resources" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Resources</Link>
                <span className="overline mt-6 block">Templates</span>
                <h1 className="font-heading text-5xl text-primary-k tracking-tight mt-4 leading-tight">Aged Care Letter Templates And Checklists</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Copy-ready letters and checklists for Australian families on Support at Home. Statement queries, invoice disputes, reassessment requests, complaints and family planning. Most pair with a free Wayly tool that does the job for your situation.
                </p>
            </section>

            {/* Search + cluster filters */}
            <section className="mx-auto max-w-5xl px-6 pb-6" data-testid="templates-controls">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-k" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search templates by name, topic or tool"
                        data-testid="templates-search"
                        className="w-full rounded-full border border-kindred bg-surface pl-10 pr-10 py-2.5 text-sm text-primary-k placeholder:text-muted-k focus:outline-none focus:ring-2 focus:ring-gold"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery("")} aria-label="Clear search" data-testid="templates-search-clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                    )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2" data-testid="templates-cluster-filters">
                    {["All", ...TEMPLATE_CLUSTERS.map((c) => c.id)].map((id) => {
                        const active = cluster === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setCluster(id)}
                                data-testid={`templates-cluster-${id.toLowerCase()}`}
                                className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${active ? "bg-primary-k text-white border-primary-k" : "bg-surface text-primary-k border-kindred hover:bg-surface-2"}`}
                            >
                                {id}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-3 text-sm text-muted-k" data-testid="templates-result-count">{filtered.length} {filtered.length === 1 ? "template" : "templates"}</p>
            </section>

            <section className="mx-auto max-w-5xl px-6 pb-20" data-testid="templates-list">
                {filtered.length === 0 && (
                    <div className="rounded-2xl border border-kindred bg-surface p-10 text-center" data-testid="templates-empty">
                        <p className="text-muted-k">No templates match "{query}".</p>
                        <button type="button" onClick={() => { setQuery(""); setCluster("All"); }} className="mt-3 text-sm text-primary-k underline">Clear filters</button>
                    </div>
                )}
                {activeClusters.map((c) => (
                    <div key={c.id} id={c.id.toLowerCase()} className="mb-10">
                        <div className="flex items-baseline justify-between">
                            <h2 className="font-heading text-2xl text-primary-k">{c.label}</h2>
                            <span className="text-xs text-muted-k">{(grouped[c.id] || []).length}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-k">{c.blurb}</p>
                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                            {(grouped[c.id] || []).map((t) => (
                                <Link key={t.slug} to={`/resources/templates/${t.slug}`} className="bg-surface border border-kindred rounded-2xl p-5 flex flex-col hover:border-[#2BC4D6] transition-colors" data-testid={`template-${t.slug}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="h-9 w-9 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0">
                                            <FileText className="h-4 w-4 text-primary-k" />
                                        </div>
                                        <h3 className="font-heading text-lg text-primary-k leading-snug">{titleCaseHeading(t.name)}</h3>
                                    </div>
                                    <p className="mt-3 text-sm text-muted-k leading-relaxed flex-1">{t.cardDesc}</p>
                                    <span className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k font-medium">Open template <ArrowRight className="h-3.5 w-3.5" /></span>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </section>
            <Footer />
        </div>
    );
}
