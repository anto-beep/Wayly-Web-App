/**
 * Shared helpers for the Onboarding wizard steps.
 *
 * Extracted verbatim from Onboarding.jsx (Feb 2026 split).
 */
import React, { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

export function WhyHint({ children }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-1">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-k hover:text-primary-k"
            >
                <HelpCircle className="h-3.5 w-3.5" />
                Why we ask
                {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {open && (
                <p className="mt-1 text-xs text-muted-k leading-relaxed border-l-2 border-kindred pl-2">{children}</p>
            )}
        </div>
    );
}

export function CompletenessRing({ pct }) {
    const R = 36;
    const C = 2 * Math.PI * R;
    const dash = (pct / 100) * C;
    const colour = pct >= 90 ? "stroke-sage" : pct >= 60 ? "stroke-primary-k" : "stroke-terracotta";
    const label = pct >= 90 ? "Comprehensive" : pct >= 60 ? "Good enough" : "Getting started";
    return (
        <div className="mt-6 flex items-center gap-4" data-testid="completeness-ring">
            <svg width="92" height="92" viewBox="0 0 92 92" className="-rotate-90">
                <circle cx="46" cy="46" r={R} className="fill-none stroke-kindred" strokeWidth="6" />
                <circle
                    cx="46" cy="46" r={R}
                    className={`fill-none ${colour}`}
                    strokeWidth="6"
                    strokeDasharray={`${dash} ${C}`}
                    strokeLinecap="round"
                />
            </svg>
            <div>
                <div className="font-heading text-2xl text-primary-k" data-testid="completeness-pct">{pct}%</div>
                <div className="text-xs text-muted-k">Profile completeness, {label}</div>
            </div>
        </div>
    );
}

export function relativeTime(iso) {
    if (!iso) return "just now";
    try {
        const then = new Date(iso).getTime();
        const now = Date.now();
        const diffSec = Math.max(0, Math.round((now - then) / 1000));
        if (diffSec < 5) return "just now";
        if (diffSec < 60) return `${diffSec}s ago`;
        const min = Math.round(diffSec / 60);
        if (min < 60) return `${min} min ago`;
        const hr = Math.round(min / 60);
        if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
        const d = Math.round(hr / 24);
        return `${d} day${d === 1 ? "" : "s"} ago`;
    } catch { return "just now"; }
}
