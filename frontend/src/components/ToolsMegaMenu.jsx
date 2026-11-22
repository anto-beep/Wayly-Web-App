import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { TOOLS_ORDERED } from "@/config/toolRegistry";

/**
 * Full-width, theme-aware Tools mega menu for the marketing nav.
 *
 * Positioned absolutely by the parent header's `relative` container so it is
 * flush to the nav content width. Uses semantic surface/text classes
 * (bg-surface-2, text-primary-k, text-muted-k, border-kindred) so it reads
 * correctly in BOTH light and dark themes. Left = featured Statement Decoder
 * + every other tool; right = a framed product screenshot of the highlighted
 * tool with a clear "Open" action.
 */
const TOOL_SHOT = {
    "statement-decoder": "/marketing/ai-tool-statement-decoder.png",
    "budget-calculator": "/marketing/ai-tool-budget-calculator.png",
    "provider-price-checker": "/marketing/ai-tool-provider-price-checker.png",
    "invoice-checker": "/marketing/ai-tool-invoice-checker.png",
    "classification-self-check": "/marketing/ai-tool-classification-self-check.png",
    "letters-and-follow-ups": "/marketing/ai-tool-reassessment-letter.png",
    "contribution-estimator": "/marketing/ai-tool-contribution-estimator.png",
    "care-plan-reviewer": "/marketing/ai-tool-care-plan-reviewer.png",
    "family-coordinator": "/marketing/ai-tool-family-coordinator.png",
};

export default function ToolsMegaMenu({ active, setActive, onClose, onMouseEnter }) {
    const activeTool = TOOLS_ORDERED.find((t) => t.slug === active) || TOOLS_ORDERED[0];
    const shot = TOOL_SHOT[activeTool?.slug];
    const ActiveIcon = activeTool?.IconComponent;
    const featured = TOOLS_ORDERED.find((t) => t.slug === "statement-decoder");
    const FeaturedIcon = featured?.IconComponent;
    const rest = TOOLS_ORDERED.filter((t) => t.slug !== "statement-decoder");

    return (
        <div
            className="absolute left-0 right-0 top-full mt-2.5 z-50"
            data-testid="tools-mega-menu"
            onMouseEnter={onMouseEnter}
        >
            <div className="rounded-2xl border border-kindred bg-white/95 backdrop-blur-xl shadow-[0_40px_90px_-20px_rgba(14,77,82,0.45)] overflow-hidden grid grid-cols-1 lg:grid-cols-[1.75fr_1fr]">
                {/* Left: featured + all tools */}
                <div className="p-6">
                    {featured && (
                        <Link
                            to={featured.marketingRoute || featured.route}
                            onClick={onClose}
                            onMouseEnter={() => setActive(featured.slug)}
                            onFocus={() => setActive(featured.slug)}
                            data-testid="mega-featured-statement-decoder"
                            className="group relative flex items-center gap-3.5 rounded-xl p-3.5 mb-5 overflow-hidden bg-gradient-to-br from-[#0E4D52] via-[#12585E] to-[#1C7A80] text-white shadow-[0_12px_30px_-8px_rgba(14,77,82,0.55)]"
                        >
                            <Sparkles className="absolute -right-3 -top-3 h-20 w-20 text-white/10" strokeWidth={1.25} />
                            <span className="h-11 w-11 flex-none rounded-xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
                                {FeaturedIcon ? <FeaturedIcon className="h-[22px] w-[22px] text-white" strokeWidth={2} /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <span className="text-[15px] font-semibold tracking-tight">{featured.name}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 mega-free-badge">Free</span>
                                </span>
                                <span className="block text-[13px] text-white/85 leading-snug mt-0.5">No signup — try it now in about 60 seconds.</span>
                            </span>
                            <ArrowRight className="h-5 w-5 text-white flex-none transition-transform group-hover:translate-x-1" />
                        </Link>
                    )}

                    <div className="px-1 pb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#0E4D52]/60">
                        All {TOOLS_ORDERED.length} Wayly tools
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1">
                        {rest.map((t) => {
                            const Icon = t.IconComponent;
                            const on = t.slug === activeTool?.slug;
                            return (
                                <Link
                                    key={t.slug}
                                    to={t.marketingRoute || t.route}
                                    data-testid={`mega-tool-${t.slug}`}
                                    onMouseEnter={() => setActive(t.slug)}
                                    onFocus={() => setActive(t.slug)}
                                    onClick={onClose}
                                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${on ? "bg-[#0E4D52]/[0.1]" : "hover:bg-[#0E4D52]/[0.1]"}`}
                                >
                                    <span className={`mt-0.5 h-9 w-9 flex-none rounded-lg flex items-center justify-center transition-colors ${on ? "bg-[#0E4D52]" : "bg-[#0E4D52]/10"}`}>
                                        {Icon ? <Icon className={`h-[18px] w-[18px] ${on ? "text-white" : "text-[#0E4D52]"}`} strokeWidth={2} /> : null}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-primary-k">{t.name}</span>
                                        <span className="block text-xs text-muted-k leading-snug mt-0.5">{t.short}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    <Link
                        to="/ai-tools"
                        onClick={onClose}
                        data-testid="mega-see-all"
                        className="group mt-4 inline-flex items-center gap-2 rounded-full bg-[#0E4D52] text-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] shadow-sm hover:bg-[#0A3A3F] transition-colors"
                    >
                        See All Tools <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>

                {/* Right: framed preview of the highlighted tool (theme-aware, no solid teal block) */}
                <div className="relative hidden lg:flex flex-col p-6 border-l border-kindred bg-surface-2">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0E4D52]/60">
                        {activeTool?.name}
                    </div>
                    <div className="mt-3 rounded-xl overflow-hidden border border-kindred shadow-md aspect-[16/10] bg-surface">
                        {shot ? (
                            <img
                                src={shot}
                                alt={`${activeTool?.name} preview`}
                                className="w-full h-full object-cover object-top"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0E4D52] to-[#1C7A80]">
                                {ActiveIcon ? <ActiveIcon className="h-12 w-12 text-white/80" strokeWidth={1.5} /> : null}
                            </div>
                        )}
                    </div>
                    <p className="mt-3 text-sm text-muted-k leading-relaxed">{activeTool?.body || activeTool?.short}</p>
                    <Link
                        to={activeTool?.marketingRoute || activeTool?.route}
                        onClick={onClose}
                        data-testid="mega-open-active"
                        className="group mt-auto pt-4 self-start inline-flex items-center gap-2 rounded-lg bg-[#0E4D52] text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#0A3A3F] transition-colors"
                    >
                        Open {activeTool?.name} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
