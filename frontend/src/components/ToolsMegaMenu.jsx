import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { TOOLS_ORDERED } from "@/config/toolRegistry";

/**
 * Full-width Tools mega menu for the marketing nav.
 *
 * Positioned absolutely by the parent header's `relative` container so it is
 * flush to the nav bar width. Left side lists every tool in two columns;
 * hovering a tool updates the right-hand "visual supporter" column, which
 * shows a real product screenshot (or a branded icon panel when a tool has
 * no screenshot asset yet).
 */
const TOOL_SHOT = {
    "statement-decoder": "/marketing/ai-tool-statement-decoder.png",
    "budget-calculator": "/marketing/ai-tool-budget-calculator.png",
    "provider-price-checker": "/marketing/ai-tool-provider-price-checker.png",
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

    return (
        <div
            className="absolute left-0 right-0 top-full mt-2 z-50"
            data-testid="tools-mega-menu"
            onMouseEnter={onMouseEnter}
        >
            <div className="rounded-2xl border border-[#0E4D52]/12 bg-white/95 backdrop-blur-xl shadow-[0_30px_80px_rgba(14,77,82,0.30)] overflow-hidden grid grid-cols-1 lg:grid-cols-[1.7fr_1fr]">
                {/* Left: every tool, two columns */}
                <div className="p-5">
                    <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0E4D52]/60">
                        All {TOOLS_ORDERED.length} Wayly tools
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1">
                        {TOOLS_ORDERED.map((t) => {
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
                                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${on ? "bg-[#0E4D52]/[0.08]" : "hover:bg-[#0E4D52]/[0.06]"}`}
                                >
                                    <span className="mt-0.5 h-9 w-9 flex-none rounded-lg bg-[#0E4D52]/10 flex items-center justify-center">
                                        {Icon ? <Icon className="h-[18px] w-[18px] text-[#0E4D52]" strokeWidth={2} /> : null}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-[#0E2A47]">{t.name}</span>
                                        <span className="block text-xs text-[#5B6B7A] leading-snug mt-0.5">{t.short}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                    <Link
                        to="/ai-tools"
                        onClick={onClose}
                        data-testid="mega-see-all"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#A5512B] px-3 hover:gap-2.5 transition-all"
                    >
                        See all tools <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                {/* Right: visual supporter for the highlighted tool */}
                <div className="relative hidden lg:flex flex-col bg-[#0E4D52] p-5 text-white">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                        {activeTool?.name}
                    </div>
                    <div className="mt-3 rounded-xl overflow-hidden border border-white/15 bg-white/5 aspect-[16/10]">
                        {shot ? (
                            <img
                                src={shot}
                                alt={`${activeTool?.name} preview`}
                                className="w-full h-full object-cover object-top"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0E4D52] to-[#13626B]">
                                {ActiveIcon ? <ActiveIcon className="h-12 w-12 text-white/80" strokeWidth={1.5} /> : null}
                            </div>
                        )}
                    </div>
                    <p className="mt-3 text-sm text-white/80 leading-relaxed">{activeTool?.body || activeTool?.short}</p>
                    <Link
                        to={activeTool?.marketingRoute || activeTool?.route}
                        onClick={onClose}
                        data-testid="mega-open-active"
                        className="mt-auto pt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2BC4D6] hover:gap-2.5 transition-all"
                    >
                        Open {activeTool?.name} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
