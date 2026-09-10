/**
 * <ToolHero toolKey="..." />, consistent top-of-page strip for every tool page.
 * Renders:
 *   1. "← All AI Tools" back-link
 *   2. The tool name (H1)
 *   3. The heroOneLiner brief description from data/toolContent.js
 *
 * Sits ABOVE the gated tool UI on every tool page, matching the design
 * the Statement Decoder already uses.
 */
import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { TOOL_CONTENT } from "@/data/toolContent";
import ToolEntriesButton from "@/components/ToolEntriesButton";

export default function ToolHero({ toolKey, wide = false }) {
    const c = TOOL_CONTENT[toolKey];
    if (!c) return null;
    return (
        <section className={`mx-auto ${wide ? "max-w-[1720px]" : "max-w-4xl"} px-6 pt-10 pb-6`} data-testid={`tool-hero-${toolKey}`}>
            <Link
                to="/ai-tools"
                data-testid={`tool-hero-back-${toolKey}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k transition-colors"
            >
                <ArrowLeft className="h-4 w-4" /> All AI Tools
            </Link>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-primary-k tracking-tight mt-4">
                {c.name}
            </h1>
            <p className="mt-3 text-lg text-muted-k leading-relaxed max-w-4xl">
                {c.heroOneLiner}
            </p>
            <ToolEntriesButton toolKey={toolKey} className="mt-5" />
        </section>
    );
}
