/**
 * DataFreshnessIndicator (spec 3.22).
 *
 * Sits directly beside any INDEX-1-sourced dollar figure or dated
 * program fact. Shows "As at DD Month YYYY" with a link to the source.
 * Screen readers get the same context via `aria-label`.
 */
import React from "react";
import { ExternalLink } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatDate(input) {
    if (!input) return "";
    const d = typeof input === "string" ? new Date(input) : input;
    if (Number.isNaN(d?.getTime?.())) return String(input);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function DataFreshnessIndicator({
    date,               // ISO date or Date instance
    sourceUrl,          // link to the DoH PDF / MyAgedCare page
    sourceLabel,        // e.g. "Department of Health, Schedule of Fees and Charges"
    testId,
}) {
    const dateStr = formatDate(date);
    if (!dateStr) return null;
    return (
        <span
            className="inline-flex items-center gap-1 text-xs"
            data-testid={testId || "uxf-freshness"}
            style={{ color: "var(--uxf-muted)" }}
            aria-label={`Data as at ${dateStr}${sourceLabel ? `. Source, ${sourceLabel}.` : ""}`}
        >
            <span>As at {dateStr}</span>
            {sourceUrl && (
                <>
                    <span aria-hidden="true">·</span>
                    <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:no-underline"
                        style={{ color: "var(--uxf-primary)" }}
                        data-testid={`${testId || "uxf-freshness"}-source`}
                    >
                        Source
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                </>
            )}
        </span>
    );
}

export default DataFreshnessIndicator;
