/**
 * CrossToolSourceIndicator (spec 3.21).
 *
 * When a tool prefills or references state pulled from another Wayly
 * tool, disclose the origin + date + one action to re-run or clear.
 *
 * If the source is older than 90 days, render an inline "consider
 * re-running" advisory (soft warning, not blocking) per spec 3.21.
 */
import React from "react";
import { ArrowUpRight, RotateCw, X } from "lucide-react";
import COPY, { interpolate } from "../copy";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function daysBetween(iso) {
    if (!iso) return 0;
    const then = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
    if (Number.isNaN(then)) return 0;
    return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

function formatDate(input) {
    if (!input) return "";
    const d = typeof input === "string" ? new Date(input) : input;
    if (Number.isNaN(d?.getTime?.())) return String(input);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * @param {Object} props
 * @param {string} props.toolName    Human-readable source tool.
 * @param {string} props.date        ISO date the source was captured.
 * @param {string} [props.href]      Deep link to re-run.
 * @param {() => void} [props.onClear] Optional clear action.
 * @param {string} [props.testId]
 */
export function CrossToolSourceIndicator({
    toolName,
    date,
    href,
    onClear,
    testId,
}) {
    if (!toolName) return null;
    const dateStr = formatDate(date);
    const isStale = daysBetween(date) > 90 || (date && (Date.now() - new Date(date).getTime()) > NINETY_DAYS_MS);
    const line = interpolate(COPY.provenance.template, { toolName, date: dateStr });

    return (
        <div
            className="rounded-lg p-3 flex items-start justify-between gap-3 text-sm"
            data-testid={testId || "uxf-cross-tool-source"}
            style={{
                backgroundColor: isStale ? "var(--uxf-warning-bg)" : "var(--uxf-info-bg)",
                border: "1px solid var(--uxf-border)",
                color: "var(--uxf-text)",
            }}
        >
            <div className="flex-1 min-w-0">
                <div style={{ color: "var(--uxf-text)" }}>{line}</div>
                {isStale && (
                    <div className="text-xs mt-1" style={{ color: "var(--uxf-warning)" }}>
                        {COPY.provenance.stale}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {href && (
                    <a
                        href={href}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold underline underline-offset-2 hover:no-underline"
                        data-testid={`${testId || "uxf-cross-tool-source"}-refresh`}
                        style={{ color: "var(--uxf-primary)" }}
                    >
                        <RotateCw className="w-3 h-3" aria-hidden="true" />
                        {COPY.provenance.refreshCta}
                        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                    </a>
                )}
                {onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label={COPY.provenance.clearCta}
                        className="p-1 rounded hover:bg-black/5"
                        data-testid={`${testId || "uxf-cross-tool-source"}-clear`}
                        style={{ color: "var(--uxf-muted)" }}
                    >
                        <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                )}
            </div>
        </div>
    );
}

export default CrossToolSourceIndicator;
