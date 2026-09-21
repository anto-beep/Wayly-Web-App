/**
 * <ToolHero toolKey="..." />, the consistent premium top-of-page banner for
 * every AI tool page. Renders:
 *   1. "← All AI Tools" back-link
 *   2. A soft brand-tinted banner with a light decorative SVG motif, an accent
 *      icon badge, the tool name (H1) and its one-line description
 *   3. A "recent entries" affordance
 *
 * Each tool gets its own accent colour / icon / motif from TOOL_VISUALS so the
 * whole tool suite feels like one premium family while staying distinct.
 */
import React from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft, ScanLine, Calculator, ClipboardCheck, Wallet, Users,
    ReceiptText, Mail, Tags, FileText, Sparkles,
} from "lucide-react";
import { TOOL_CONTENT } from "@/data/toolContent";
import ToolEntriesButton from "@/components/ToolEntriesButton";

const SOFT = {
    "#0E4D52": "#E9F2F1",
    "#A5512B": "#F7ECE3",
    "#4E6E54": "#ECF1EA",
    "#9C6F1F": "#F6EEDD",
    "#B5502F": "#F8EAE3",
};

const TOOL_VISUALS = {
    "statement-decoder": { accent: "#0E4D52", Icon: ScanLine, motif: "rings" },
    "budget-calculator": { accent: "#4E6E54", Icon: Calculator, motif: "pie" },
    "classification-self-check": { accent: "#A5512B", Icon: ClipboardCheck, motif: "rings" },
    "contribution-estimator": { accent: "#0E4D52", Icon: Wallet, motif: "coins" },
    "family-coordinator": { accent: "#9C6F1F", Icon: Users, motif: "waves" },
    "invoice-checker": { accent: "#B5502F", Icon: ReceiptText, motif: "coins" },
    "letters-and-follow-ups": { accent: "#4E6E54", Icon: Mail, motif: "waves" },
    "provider-price-checker": { accent: "#9C6F1F", Icon: Tags, motif: "coins" },
    "reassessment-letter": { accent: "#0E4D52", Icon: FileText, motif: "rings" },
    _default: { accent: "#0E4D52", Icon: Sparkles, motif: "rings" },
};

function HeroArt({ accent, variant }) {
    return (
        <svg className="pointer-events-none absolute -top-10 -right-8 h-52 w-52 opacity-[0.11]" viewBox="0 0 200 200" aria-hidden="true">
            {variant === "rings" && (
                <g fill="none" stroke={accent} strokeWidth="11">
                    <circle cx="120" cy="80" r="66" />
                    <circle cx="120" cy="80" r="40" />
                    <circle cx="120" cy="80" r="15" fill={accent} stroke="none" />
                </g>
            )}
            {variant === "coins" && (
                <g fill="none" stroke={accent} strokeWidth="10">
                    <ellipse cx="120" cy="46" rx="54" ry="17" />
                    <ellipse cx="120" cy="82" rx="54" ry="17" />
                    <ellipse cx="120" cy="118" rx="54" ry="17" />
                </g>
            )}
            {variant === "pie" && (
                <g>
                    <circle cx="120" cy="82" r="62" fill="none" stroke={accent} strokeWidth="10" />
                    <path d="M120 82 L120 20 A62 62 0 0 1 175 112 Z" fill={accent} />
                </g>
            )}
            {variant === "waves" && (
                <g fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round">
                    <path d="M40 56 q30 -26 60 0 t60 0" />
                    <path d="M40 96 q30 -26 60 0 t60 0" />
                    <path d="M40 136 q30 -26 60 0 t60 0" />
                </g>
            )}
        </svg>
    );
}

export default function ToolHero({ toolKey, wide = false }) {
    const c = TOOL_CONTENT[toolKey];
    if (!c) return null;
    const v = TOOL_VISUALS[toolKey] || TOOL_VISUALS._default;
    const soft = SOFT[v.accent] || "#EFEAE0";
    const Icon = v.Icon;
    return (
        <section className={`mx-auto ${wide ? "max-w-[1720px]" : "max-w-4xl"} px-6 pt-8 pb-4`} data-testid={`tool-hero-${toolKey}`}>
            <Link
                to="/ai-tools"
                data-testid={`tool-hero-back-${toolKey}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k transition-colors"
            >
                <ArrowLeft className="h-4 w-4" /> All AI Tools
            </Link>
            <div
                className="relative mt-4 overflow-hidden rounded-3xl border shadow-sm p-6 sm:p-8"
                style={{ borderColor: `${v.accent}2E`, background: `linear-gradient(135deg, ${soft} 0%, #FBF8F3 64%)` }}
                data-testid={`tool-hero-banner-${toolKey}`}
            >
                <HeroArt accent={v.accent} variant={v.motif} />
                <div className="relative flex items-start gap-4">
                    <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-white shadow" style={{ backgroundColor: v.accent }}>
                        <Icon className="h-7 w-7" />
                    </span>
                    <div className="min-w-0">
                        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em]" style={{ color: v.accent }}>AI Tool</div>
                        <h1 className="font-heading text-3xl sm:text-4xl lg:text-[2.75rem] text-primary-k tracking-tight leading-[1.05]">
                            {c.name}
                        </h1>
                    </div>
                </div>
                <p className="relative mt-3 text-base sm:text-lg text-primary-k/75 leading-relaxed max-w-3xl">
                    {c.heroOneLiner}
                </p>
                <div className="relative">
                    <ToolEntriesButton toolKey={toolKey} className="mt-5" />
                </div>
            </div>
        </section>
    );
}
