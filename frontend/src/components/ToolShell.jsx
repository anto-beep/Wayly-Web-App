/**
 * ToolShell, UI-2 Phase 4 + Phase 5 helpers shared across all 8 AI tools.
 *
 * The prompt in UI-2 §4.3 says every tool output must:
 *   1. Open with a plain-English SUMMARY block *before* any tables / rows /
 *      numbers. Fraunces heading, Inter body copy, no jargon.
 *   2. Render every number in IBM Plex Mono (see `NumberMono` below).
 *   3. Offer a consistent "Report An Issue" affordance in the same place on
 *      every tool. §5 confirms 9.9 = extend the existing Button, so the
 *      variant lives on `<Button variant="report-issue">`, not a new file.
 *
 * These are tiny wrappers so the 8 tools stay skimmable; the styling lives
 * here so a design change happens in one place.
 */
import React from "react";
import { Sparkles, AlertCircle, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The plain-English opener that sits at the very top of every tool result.
 *
 * Example:
 *   <ToolSummary
 *       toolName="Statement Decoder"
 *       headline="Your March statement looks fine, but two personal-care hours were double-charged."
 *       body="Wayly checked every line against your care plan and your Support at Home budget. We found 1 anomaly worth flagging with BlueBerry Care and 47 lines that match exactly."
 *   />
 */
export function ToolSummary({ toolName, headline, body, tone = "neutral", testId = "tool-summary" }) {
    const toneClasses = {
        neutral: "bg-surface border-kindred text-primary-k",
        alert: "bg-terracotta/8 border-terracotta/30 text-primary-k",
        success: "bg-sage/10 border-sage/30 text-primary-k",
    }[tone] || "bg-surface border-kindred text-primary-k";

    return (
        <section
            data-testid={testId}
            className={`rounded-2xl border p-5 sm:p-6 ${toneClasses}`}
            aria-label={`${toolName} summary`}
        >
            <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted-k font-medium">{toolName} Summary</span>
            </div>
            {headline && (
                <h2 className="font-heading text-xl sm:text-2xl text-primary-k mt-2 leading-snug" data-testid={`${testId}-headline`}>
                    {headline}
                </h2>
            )}
            {body && (
                <p className="text-sm sm:text-base text-primary-k mt-3 leading-relaxed" data-testid={`${testId}-body`}>
                    {body}
                </p>
            )}
        </section>
    );
}

/**
 * Reusable "Report An Issue" chip. Opens the support-ticket flow with the
 * tool and result pre-filled in the ticket subject so the SUP-0..SUP-3
 * classifier routes correctly.
 */
export function ReportIssueButton({ tool, resultId, className = "", testId }) {
    const href = `/support/new?category=ai_tool&tool=${encodeURIComponent(tool)}${resultId ? `&result_id=${encodeURIComponent(resultId)}` : ""}`;
    return (
        <Button
            asChild
            variant="report-issue"
            className={className}
            data-testid={testId || `report-issue-${tool.toLowerCase().replace(/\s+/g, "-")}`}
        >
            <a href={href}>
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Something Not Right? Report An Issue</span>
            </a>
        </Button>
    );
}

/**
 * Compact "report this row" affordance for inline anomaly rows (§4.3).
 */
export function ReportRowLink({ tool, resultId, rowId, className = "" }) {
    const href = `/support/new?category=ai_tool&tool=${encodeURIComponent(tool)}${resultId ? `&result_id=${encodeURIComponent(resultId)}` : ""}${rowId ? `&row=${encodeURIComponent(rowId)}` : ""}`;
    return (
        <a
            href={href}
            className={`inline-flex items-center gap-1 text-[11px] text-muted-k hover:text-primary-k underline decoration-dotted underline-offset-2 ${className}`}
            data-testid={`report-row-${rowId || "any"}`}
        >
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            <span>Report This</span>
        </a>
    );
}

/**
 * NumberMono, every tool number renders through this so IBM Plex Mono +
 * tabular figures apply consistently. Rule 2.5 also lives here: if a caller
 * accidentally passes "$3 90 cents" style text we render exactly what was
 * passed but call out the shape to the tool author via console.warn in dev.
 */
export function NumberMono({ children, className = "", ...rest }) {
    if (process.env.NODE_ENV !== "production" && typeof children === "string" && /\$\d+ \d+ ?cents?/i.test(children)) {
        console.warn("[NumberMono] Broken currency shape detected, rewrite as $X.YY:", children);
    }
    return <span className={`font-mono tabular-nums ${className}`} {...rest}>{children}</span>;
}
