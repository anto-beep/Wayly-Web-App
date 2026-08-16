/**
 * ToolClusterGrid, themed clusters replacing the flat 9-tool grid.
 *
 * Groups the non-flagship tools into three semantic clusters so the
 * homepage no longer treats every tool as equal weight. Ask Wayly
 * is featured as the conversational entry at the bottom.
 *
 * Design decision: the two flagship tools (Statement Decoder + Invoice
 * Checker) live in the DualFlagshipHero above; this section covers the
 * remaining seven plus Ask Wayly's conversational surface.
 */
import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle } from "lucide-react";
import { TOOLS_ORDERED } from "@/config/toolRegistry";

/** Cluster definitions, slug lists MUST match toolRegistry slugs. */
const CLUSTERS = [
    {
        id: "money-statements",
        title: "Money & Statements",
        blurb: "Anything to do with the dollars, from reading statements to checking rates and forecasting your budget.",
        tone: "sage",
        slugs: ["budget-calculator", "provider-price-checker", "contribution-estimator"],
    },
    {
        id: "care-coordination",
        title: "Care Coordination",
        blurb: "Aligning the paperwork with the people. Care plans, classifications, and the letters that get things moving.",
        tone: "clay",
        slugs: ["care-plan-reviewer", "classification-self-check", "letters-and-follow-ups"],
    },
];

const CLUSTER_TONE = {
    sage: {
        eyebrow: "text-primary-k",
        dot: "bg-sage",
        border: "border-sage/30",
        hover: "hover:border-primary-k hover:shadow-[0_18px_48px_rgba(15,86,72,0.18)]",
    },
    clay: {
        eyebrow: "text-clay-dark",
        dot: "bg-clay",
        border: "border-clay/30",
        hover: "hover:border-clay hover:shadow-[0_18px_48px_rgba(181,124,87,0.22)]",
    },
};

function ToolCard({ tool }) {
    const Icon = tool.IconComponent;
    return (
        <Link
            to={tool.marketingRoute || tool.route}
            data-testid={`cluster-tool-${tool.slug}`}
            className="group block rounded-xl border border-kindred bg-surface p-5 hover:-translate-y-0.5 hover:border-primary-k/40 hover:shadow-md transition-all"
        >
            <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-surface-2 inline-flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary-k" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <h4 className="font-heading text-base text-primary-k">{tool.name}</h4>
                    <p className="mt-1.5 text-sm text-muted-k leading-relaxed line-clamp-3">{tool.short}</p>
                </div>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k group-hover:gap-2 transition-all">
                Open tool <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
        </Link>
    );
}

export default function ToolClusterGrid() {
    const bySlug = Object.fromEntries(TOOLS_ORDERED.map((t) => [t.slug, t]));
    const askWayly = bySlug["family-coordinator"];

    return (
        <section className="mx-auto max-w-7xl px-6 py-20" data-testid="tool-cluster-grid">
            <span className="overline">Everything else Wayly does</span>
            <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 max-w-3xl tracking-tight">
                Seven more tools, grouped the way families think.
            </h2>
            <p className="mt-3 text-base text-muted-k max-w-2xl leading-relaxed">
                The Statement Decoder and Invoice Checker are the front door. Once you&apos;re inside, these are the tools waiting to help with the rest of your parent&apos;s care.
            </p>

            <div className="mt-12 space-y-14" data-testid="clusters">
                {CLUSTERS.map((cluster) => {
                    const tone = CLUSTER_TONE[cluster.tone] || CLUSTER_TONE.sage;
                    const tools = cluster.slugs.map((s) => bySlug[s]).filter(Boolean);
                    return (
                        <div key={cluster.id} data-testid={`cluster-${cluster.id}`}>
                            <div className="flex-1 min-w-0">
                                <h3 className={`font-heading text-2xl ${tone.eyebrow} tracking-tight`}>{cluster.title}</h3>
                                <p className="mt-2 text-sm text-muted-k leading-relaxed max-w-2xl">{cluster.blurb}</p>
                            </div>
                            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {tools.map((t) => (
                                    <ToolCard key={t.slug} tool={t} />
                                ))}
                            </div>
                        </div>
                    );
                })}

                {/* Ask Wayly cluster */}
                {askWayly && (
                    <div data-testid="cluster-ask-wayly">
                        <div className="flex-1 min-w-0">
                            <h3 className="font-heading text-2xl text-primary-k tracking-tight">Ask Wayly</h3>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed max-w-2xl">
                                When the paperwork raises more questions than it answers. Plain-English replies grounded in the Aged Care Act 2024.
                            </p>
                        </div>
                        <div className="mt-6 rounded-2xl border-2 border-primary-k/20 bg-gradient-to-br from-primary-k/[0.06] to-transparent p-6 lg:p-7">
                            <div className="flex items-start gap-4 flex-wrap">
                                <div className="h-12 w-12 rounded-xl bg-primary-k/10 text-primary-k inline-flex items-center justify-center shrink-0">
                                    <MessageCircle className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <div className="flex-1 min-w-[240px]">
                                    <div className="font-heading text-xl text-primary-k">{askWayly.name}</div>
                                    <p className="mt-1.5 text-sm text-primary-k/80 leading-relaxed">{askWayly.short}</p>
                                </div>
                                <Link
                                    to={askWayly.marketingRoute || askWayly.route}
                                    data-testid="cluster-ask-wayly-cta"
                                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white text-sm font-medium px-5 py-2.5 hover:brightness-95"
                                >
                                    Start a conversation <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
