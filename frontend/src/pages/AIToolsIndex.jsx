import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { ArrowRight } from "lucide-react";
import AIAccuracyBanner from "@/components/AIAccuracyBanner";
import { usePlanState } from "@/hooks/usePlanState";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

// INV-1 v1.2 WS16, single source of truth for every tool.
import { TOOLS_ORDERED, TOOL_COUNT, isBadgeActive, toolCountWord } from "@/config/toolRegistry";

/**
 * Small helper that pluralises the tool count into a heading fragment.
 * Delegates to the shared implementation in `toolRegistry.js` so the
 * word is consistent across every surface (Landing, AI Tools, etc.).
 */

export default function AIToolsIndex() {
    const plan = usePlanState();
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.aiTools} />
            <MarketingHeader />
            <section className="mx-auto max-w-7xl px-6 pt-12 pb-8">
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight leading-tight max-w-3xl wf-dot-lg" data-testid="ai-tools-heading">
                    {toolCountWord(TOOL_COUNT)} Tools. Built for Australian Families.
                </h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl">
                    Drop in a statement, paste a care plan, or run the numbers. Every tool below turns 30 minutes of paperwork into a 2-minute plain-English answer.
                </p>
                <div className="mt-6 grid sm:grid-cols-3 gap-3 max-w-3xl">
                    <div className="rounded-2xl border border-primary-k/10 bg-white/60 p-3 text-sm text-primary-k/80">
                        <span className="font-medium text-primary-k">Try free.</span> Statement Decoder is free; every other tool comes with a 7-day trial.
                    </div>
                    <div className="rounded-2xl border border-primary-k/10 bg-white/60 p-3 text-sm text-primary-k/80">
                        <span className="font-medium text-primary-k">Grounded in law.</span> Every answer cites the Aged Care Act 2024 rule that applies.
                    </div>
                    <div className="rounded-2xl border border-primary-k/10 bg-white/60 p-3 text-sm text-primary-k/80">
                        <span className="font-medium text-primary-k">Private by default.</span> Your data stays yours, no training on your files.
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-20">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="ai-tools-grid">
                    {TOOLS_ORDERED.map((t) => {
                        const Icon = t.IconComponent;
                        const isFreeTool = t.planTone === "free";
                        const hasFullAccess = plan.isPaid || plan.isTrialing;
                        let chipLabel = t.plan;
                        let chipTone = t.planTone;
                        let showChip = true;
                        let showSub = Boolean(t.planSub);
                        if (hasFullAccess) {
                            showChip = false;
                            showSub = false;
                        } else if (!isFreeTool) {
                            if (plan.isTrialing) { chipLabel = "7-day free trial"; chipTone = "trial"; showSub = false; }
                        }
                        const badgeActive = isBadgeActive(t);
                        return (
                            <div
                                key={t.slug}
                                className="rounded-xl border border-kindred bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-lg relative"
                                data-testid={`ai-tool-card-${t.slug}`}
                            >
                                {badgeActive && (
                                    <span
                                        className="absolute -top-2 left-4 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 bg-clay text-white"
                                        data-testid={`ai-tool-badge-${t.slug}`}
                                    >
                                        New
                                    </span>
                                )}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                                        <Icon className="h-5 w-5 text-primary-k" />
                                    </div>
                                    {showChip && (
                                        <div className="text-right">
                                            <span
                                                className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 ${
                                                    chipTone === "free"
                                                        ? "bg-sage/20 text-[#0F5648]"
                                                        : chipTone === "trial"
                                                            ? "bg-clay/20 text-clay"
                                                            : "bg-[#0E2A47] text-white"
                                                }`}
                                                data-testid={`ai-tool-plan-${t.slug}`}
                                            >
                                                {chipLabel}
                                            </span>
                                            {showSub && <div className="text-[10px] text-muted-k mt-1">{t.planSub}</div>}
                                        </div>
                                    )}
                                </div>
                                <h2 className="font-heading text-xl text-primary-k mt-4">{t.name}</h2>
                                <p className="mt-2 text-sm text-muted-k leading-relaxed">{t.body}</p>
                                <Link to={t.route} className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k font-medium" data-testid={`ai-tool-link-${t.slug}`}>
                                    {hasFullAccess || !isFreeTool ? "Open tool" : "Try free"} <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        );
                    })}
                </div>
                <AIAccuracyBanner className="mt-12" />
            </section>
            <Footer />
        </div>
    );
}
