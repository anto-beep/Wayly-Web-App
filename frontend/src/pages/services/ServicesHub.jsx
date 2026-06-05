import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHubLinks from "@/components/SeoHubLinks";
import SeoHead from "@/seo/SeoHead";
import { SERVICES } from "@/data/services";

export default function ServicesHub() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: "https://wayly.com.au/" },
                    { "@type": "ListItem", position: 2, name: "Services" },
                ],
            },
            {
                "@type": "CollectionPage",
                name: "Support at Home service explainers",
                url: "https://wayly.com.au/services",
                description: "Eight plain-English explainers for the most-used Support at Home services.",
            },
        ],
    };
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Support at Home service explainers — cleaning, personal care, nursing and more | Wayly"
                description="Eight plain-English explainers covering the most-used Support at Home services. What is funded, what is not, typical rates, and how the contribution works."
                canonical="https://wayly.com.au/services"
                jsonLd={jsonLd}
            />
            <MarketingHeader />
            <main id="main-content">
            <div className="mx-auto max-w-6xl px-6 pt-10 pb-16">
                <span className="overline">Service explainers</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-[#0E2A47] mt-3 leading-tight tracking-tight" data-testid="services-h1">
                    Support at Home services, finally explained
                </h1>
                <p className="mt-4 text-[#3C4A5E] max-w-2xl leading-relaxed">
                    Eight short reads that cover what each Support at Home service includes, what it does not, typical rates, and how the participant contribution applies. Each page links to the Wayly tool that helps you act on it.
                </p>

                <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="services-grid">
                    {SERVICES.map((s) => (
                        <Link
                            key={s.slug}
                            to={`/services/${s.slug}`}
                            data-testid={`service-card-${s.slug}`}
                            className="group rounded-2xl border border-[#CFE0F0] bg-white p-5 hover:border-[#2BC4D6] hover:-translate-y-0.5 transition-all"
                        >
                            <div className="overline">{s.overline}</div>
                            <h2 className="font-heading text-xl text-[#0E2A47] mt-2 leading-tight">{s.h1}</h2>
                            <p className="mt-2 text-sm text-[#4A5A75] leading-relaxed line-clamp-3">{s.description}</p>
                            <div className="mt-4 text-sm font-medium text-[#1565B8] inline-flex items-center gap-1">
                                Read explainer <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            </main>
            <SeoHubLinks exclude="/services" />
            <Footer />
        </div>
    );
}
