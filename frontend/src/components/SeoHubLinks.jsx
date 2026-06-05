import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const HUBS = [
    { href: "/support-at-home-levels", label: "Support at Home levels", sub: "All eight classifications with budgets" },
    { href: "/services", label: "Service explainers", sub: "Cleaning, personal care, nursing and six more" },
    { href: "/policy", label: "Policy explainers", sub: "Personal care change, no-worse-off, caps status" },
    { href: "/guides", label: "Caregiver guides", sub: "Practical and emotional reads for family carers" },
    { href: "/faq", label: "FAQ", sub: "Forty Q&A across five themes" },
    { href: "/ask-wayly", label: "Ask Wayly", sub: "Free chat grounded in the public rules" },
];

/**
 * Phase 5 hub-and-spoke wiring — small cluster strip that renders on every
 * hub and content page so visitors always find the next-best Wayly resource.
 * Pass `exclude` to hide the current hub from its own list.
 */
export default function SeoHubLinks({ exclude }) {
    const items = HUBS.filter((h) => h.href !== exclude);
    return (
        <section className="mx-auto max-w-6xl px-6 py-12 border-t border-kindred" aria-labelledby="hub-strip-h" data-testid="seo-hub-strip">
            <h2 id="hub-strip-h" className="font-heading text-2xl text-[#0E2A47] tracking-tight">Explore the rest of Wayly</h2>
            <p className="mt-2 text-sm text-[#4A5A75]">Every hub is free to read and updated as the policy changes.</p>
            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((h) => (
                    <Link
                        key={h.href}
                        to={h.href}
                        data-testid={`hub-link-${h.href.replace(/[^a-z0-9]+/gi, "-")}`}
                        className="group rounded-2xl border border-[#CFE0F0] bg-white p-4 hover:border-[#2BC4D6] hover:-translate-y-0.5 transition-all"
                    >
                        <div className="font-heading text-base text-[#0E2A47] leading-snug">{h.label}</div>
                        <div className="mt-1 text-xs text-[#4A5A75]">{h.sub}</div>
                        <div className="mt-3 text-sm font-medium text-[#1565B8] inline-flex items-center gap-1">
                            Visit <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
