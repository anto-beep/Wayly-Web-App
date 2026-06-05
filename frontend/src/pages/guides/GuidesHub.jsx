import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHubLinks from "@/components/SeoHubLinks";
import SeoHead from "@/seo/SeoHead";
import { PROBLEM_GUIDES, EMOTIONAL_GUIDES } from "@/data/guides";

function GuideCard({ g }) {
    return (
        <Link
            to={`/guides/${g.slug}`}
            data-testid={`guide-card-${g.slug}`}
            className="group block rounded-2xl border border-[#CFE0F0] bg-white p-5 hover:border-[#2BC4D6] hover:-translate-y-0.5 transition-all"
        >
            <div className="overline">{g.overline}</div>
            <h3 className="font-heading text-lg text-[#0E2A47] mt-2 leading-tight">{g.h1}</h3>
            <p className="mt-2 text-sm text-[#4A5A75] leading-relaxed line-clamp-3">{g.description}</p>
            <div className="mt-3 text-sm font-medium text-[#1565B8] inline-flex items-center gap-1">
                Read guide <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
        </Link>
    );
}

export default function GuidesHub() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: "https://wayly.com.au/" },
                    { "@type": "ListItem", position: 2, name: "Guides" },
                ],
            },
            {
                "@type": "CollectionPage",
                name: "Caregiver guides",
                url: "https://wayly.com.au/guides",
            },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Caregiver guides for Australian families | Wayly"
                description="Practical and emotional guides for adult-child caregivers. Talking to a parent about aged care, sibling disagreements, caregiver guilt, and more."
                canonical="https://wayly.com.au/guides"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-6xl px-6 pt-10 pb-16">
                <span className="overline">Caregiver guides</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-[#0E2A47] mt-3 leading-tight tracking-tight" data-testid="guides-h1">
                    Guides for the family carer
                </h1>
                <p className="mt-4 text-[#3C4A5E] max-w-2xl leading-relaxed">
                    Two kinds of guide. Practical guides for the situations you can act on. Emotional guides for the parts of caring that do not show up on a statement.
                </p>

                <h2 className="font-heading text-2xl text-[#0E2A47] mt-12 tracking-tight">When you need to fix something</h2>
                <div className="mt-4 grid sm:grid-cols-2 gap-4" data-testid="problem-guides-grid">
                    {PROBLEM_GUIDES.map((g) => <GuideCard key={g.slug} g={g} />)}
                </div>

                <h2 className="font-heading text-2xl text-[#0E2A47] mt-12 tracking-tight">When the conversation feels harder than the task</h2>
                <div className="mt-4 grid sm:grid-cols-2 gap-4" data-testid="emotional-guides-grid">
                    {EMOTIONAL_GUIDES.map((g) => <GuideCard key={g.slug} g={g} />)}
                </div>
            </div>
            </main>
            <SeoHubLinks exclude="/guides" />
            <Footer />
        </div>
    );
}
