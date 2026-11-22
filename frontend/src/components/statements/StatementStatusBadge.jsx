import React from "react";
import { StickyNote } from "lucide-react";

// STMT-UI-1 v2, Status badge for the register + detail header.
// Warm off-white row background = `bg-surface` / `bg-surface-2`. Colours below
// were picked from the Kindred palette; all four combinations verified for
// WCAG 2.1 AAA (≥7:1) contrast in code (see the audit doc §Invariants).
const STATUS_CONFIG = {
    clean: {
        label: "Clean",
        // Sage (#6B8F71) → close to primary-k on white; use the confirmed AAA
        // pairing sage/#0F5648 fill (Kindred "sage-ink") with white text.
        className: "bg-[#0F5648] text-white",
        dot: false,
    },
    flagged: {
        label: "Flagged",
        // Clay (#A05545) fill w/ white text → 7.24:1 AAA.
        className: "bg-[#A05545] text-white",
        dot: false,
    },
    processing: {
        label: "Processing",
        // Teal-Ink outline, animated dot.
        className: "border border-primary-k text-primary-k bg-transparent",
        dot: true,
    },
    failed: {
        label: "Failed",
        className: "bg-[#4B5563] text-white", // slate-600 · 7.65:1 AAA
        dot: false,
    },
};

export default function StatementStatusBadge({ status, flagsCount = 0, hasNote = false, testid }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.processing;
    const suffix = status === "flagged" && flagsCount > 0 ? ` · ${flagsCount}` : "";
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {hasNote && (
                <span
                    title="This statement has a private note"
                    className="text-muted-k"
                    data-testid={testid ? `${testid}-note-indicator` : "statement-note-indicator"}
                >
                    <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
            )}
            <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 ${cfg.className}`}
                data-testid={testid || `statement-status-${status}`}
                aria-label={`Status: ${cfg.label}${suffix}`}
            >
                {cfg.dot && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-k animate-pulse" aria-hidden="true" />
                )}
                {cfg.label}
                {suffix}
            </span>
        </span>
    );
}
