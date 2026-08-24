import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const HUBS = [
    { href: "/support-at-home-levels", label: "Support at Home Levels", sub: "All eight classifications with budgets" },
    { href: "/services", label: "Service Explainers", sub: "Cleaning, personal care, nursing and six more" },
    { href: "/policy", label: "Policy Explainers", sub: "Personal care change, no worse off, caps status" },
    { href: "/guides", label: "Caregiver Guides", sub: "Practical and emotional reads for family carers" },
    { href: "/faq", label: "FAQ", sub: "Forty questions and answers across five themes" },
    { href: "/ask-wayly", label: "Ask Wayly", sub: "Free chat grounded in the public rules" },
];

/**
 * Phase 5 hub-and-spoke wiring, small cluster strip that renders on every
 * hub and content page so visitors always find the next-best Wayly resource.
 * Pass `exclude` to hide the current hub from its own list.
 */
export default function SeoHubLinks({ exclude }) {
    const items = HUBS.filter((h) => h.href !== exclude);
    return (
        <section className="border-t border-kindred bg-surface-2/50" aria-labelledby="hub-strip-h" data-testid="seo-hub-strip">
            <div className="mx-auto max-w-6xl px-6 py-16">
                <div className="text-center max-w-2xl mx-auto">
                    <span className="overline text-[#A5512B]">Keep exploring</span>
                    <h2 id="hub-strip-h" className="font-heading text-3xl sm:text-4xl text-[#0E2A47] tracking-tight mt-2">
                        Explore the Rest of Wayly
                    </h2>
                    <p className="mt-3 text-base text-[#4A5A75] leading-relaxed">
                        Every hub is free to read and kept up to date as the aged care rules change. Pick where you want to go next.
                    </p>
                </div>
                <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((h) => (
                        <Link
                            key={h.href}
                            to={h.href}
                            data-testid={`hub-link-${h.href.replace(/[^a-z0-9]+/gi, "-")}`}
                            className="group rounded-2xl border border-[#CFE0F0] bg-white p-5 shadow-sm hover:shadow-md hover:border-[#2BC4D6] hover:-translate-y-1 transition-all"
                        >
                            <div className="font-heading text-lg text-[#0E2A47] leading-snug group-hover:text-[#1565B8] transition-colors">{h.label}</div>
                            <div className="mt-1.5 text-sm text-[#4A5A75] leading-relaxed">{h.sub}</div>
                            <div className="mt-4 text-sm font-semibold text-[#A5512B] inline-flex items-center gap-1.5">
                                Explore <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
