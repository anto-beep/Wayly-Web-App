import React, { useState } from "react";
import { ChevronDown, AlertOctagon, AlertTriangle, Info, Lightbulb } from "lucide-react";
import { humanize, shortSummary, flagTint } from "@/lib/plainText";

/**
 * FlagCard — the single, shared flag/issue card used by BOTH the Statement
 * Decoder anomalies and the Invoice Checker issues, so they read identically.
 *
 * COLLAPSED BY DEFAULT: shows a plain-English title, a severity chip and (if
 * present) a dollar-impact pill. Tapping the row expands the plain-English
 * explanation, the "What to do" step and any supporting evidence.
 *
 * Props — a normalised flag:
 *   idx        number   (for the rotating teal/clay/sage/plum tint)
 *   severity   "high" | "medium" | "low"
 *   title      string   (raw; humanised here)
 *   detail     string   (raw; humanised here)
 *   action     string   (raw; humanised here — "What to do")
 *   evidence   string[] (raw lines; humanised here)
 *   dollarImpact number
 *   testId     string
 */
const SEV = {
    high: { label: "Needs attention", Icon: AlertOctagon, chip: "bg-terracotta text-white" },
    medium: { label: "Worth a look", Icon: AlertTriangle, chip: "bg-gold text-white" },
    low: { label: "For your info", Icon: Info, chip: "bg-sage text-white" },
};

export default function FlagCard({
    idx = 0,
    severity = "medium",
    title,
    detail,
    action,
    evidence = [],
    dollarImpact,
    testId,
}) {
    const [open, setOpen] = useState(false);
    const meta = SEV[severity] || SEV.medium;
    const heading = humanize(title) || "Something to check";
    const summary = shortSummary(detail);
    const full = humanize(detail);
    const hasDetail = Boolean(full) || (Array.isArray(evidence) && evidence.length > 0) || Boolean(action);

    return (
        <li className={`rounded-xl border ${flagTint(idx)}`} data-testid={testId}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                data-testid={testId ? `${testId}-toggle` : undefined}
                className="w-full flex items-center gap-3 p-4 text-left"
            >
                <span className={`h-8 w-8 rounded-full flex items-center justify-center flex-none ${meta.chip}`}>
                    <meta.Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.chip}`}>{meta.label}</span>
                        {dollarImpact != null && dollarImpact > 0 && (
                            <span className="text-[11px] rounded-full bg-terracotta/10 text-terracotta px-2 py-0.5 font-semibold tabular-nums">
                                Could affect ${Number(dollarImpact).toFixed(2)}
                            </span>
                        )}
                    </span>
                    <span className="mt-1 block font-medium text-primary-k text-sm">{heading}</span>
                </span>
                <ChevronDown className={`h-4 w-4 flex-none text-muted-k transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && hasDetail && (
                <div className="px-4 pb-4 -mt-1" data-testid={testId ? `${testId}-body` : undefined}>
                    {full && <p className="text-sm text-primary-k/90 leading-relaxed">{full}</p>}
                    {action && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-gold/10 border border-gold/30 px-3 py-2.5">
                            <Lightbulb className="h-4 w-4 text-gold flex-none mt-0.5" />
                            <div className="text-[13px] text-primary-k"><span className="font-semibold">What to do: </span>{humanize(action)}</div>
                        </div>
                    )}
                    {Array.isArray(evidence) && evidence.length > 0 && (
                        <ul className="mt-3 ml-4 list-disc space-y-1 text-xs text-muted-k">
                            {evidence.map((e, i) => <li key={i} className="tabular-nums leading-relaxed">{humanize(e)}</li>)}
                        </ul>
                    )}
                </div>
            )}
        </li>
    );
}
