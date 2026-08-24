import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHubLinks from "@/components/SeoHubLinks";
import SeoHead from "@/seo/SeoHead";
import { POLICIES } from "@/data/policies";

export default function PolicyHub() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: "https://wayly.com.au/" },
                    { "@type": "ListItem", position: 2, name: "Policy" },
                ],
            },
            {
                "@type": "CollectionPage",
                name: "Support at Home policy explainers",
                url: "https://wayly.com.au/policy",
            },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Support at Home policy explainers | Wayly"
                description="Plain-English explainers for the most-asked Support at Home policy questions. Personal care change, service price caps status, no worse off guarantee."
                canonical="https://wayly.com.au/policy"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-4xl px-6 pt-10 pb-16">
                <span className="overline">Policy explainers</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-[#0E2A47] mt-3 leading-tight tracking-tight" data-testid="policy-h1">
                    The policies that affect your funding
                </h1>
                <p className="mt-4 text-[#3C4A5E] max-w-2xl leading-relaxed">
                    Three short reads that cover the policy questions families ask most. Updated as the rules change.
                </p>
                <div className="mt-10 space-y-3" data-testid="policy-grid">
                    {POLICIES.map((p) => (
                        <Link
                            key={p.slug}
                            to={`/policy/${p.slug}`}
                            data-testid={`policy-card-${p.slug}`}
                            className="group block rounded-2xl border border-[#CFE0F0] bg-white p-5 hover:border-[#2BC4D6] hover:-translate-y-0.5 transition-all"
                        >
                            <div className="overline">{p.overline}</div>
                            <h2 className="font-heading text-xl text-[#0E2A47] mt-2 leading-tight">{p.h1}</h2>
                            <p className="mt-2 text-sm text-[#4A5A75] leading-relaxed">{p.description}</p>
                            <div className="mt-3 text-sm font-medium text-[#1565B8] inline-flex items-center gap-1">
                                Read explainer <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            </main>
            <SeoHubLinks exclude="/policy" />
            <Footer />
        </div>
    );
}
