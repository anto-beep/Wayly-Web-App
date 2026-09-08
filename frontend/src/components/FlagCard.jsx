import React, { useState } from "react";
import { ChevronDown, AlertOctagon, AlertTriangle, Info, Lightbulb, PenLine } from "lucide-react";
import { cleanTitle, plainBody } from "@/lib/plainText";

/**
 * FlagCard — the single, shared flag/issue card used by the Statement Decoder
 * anomalies, the Invoice Checker issues and Statement Detail, so they read
 * identically.
 *
 * COLLAPSED BY DEFAULT: a clean, properly-capitalised title, a severity chip
 * and (if present) a dollar-impact pill. Tapping expands a tight plain-English
 * explanation (long date lists condensed to "N dates"), one "What to do" step,
 * and — when onDraftLetter is provided — a "Draft a letter about this" button.
 * Raw signal bullets (pension status, affected streams, program refs) are NOT
 * shown; they were confusing filler.
 *
 * Props:
 *   idx, severity ("high"|"medium"|"low"), title, detail, action,
 *   dollarImpact, onDraftLetter (fn), draftBusy (bool), testId
 */
const SEV = {
    high: { label: "Needs attention", Icon: AlertOctagon, chip: "bg-terracotta text-white", tint: "bg-[rgba(178,58,46,0.06)] border-[rgba(178,58,46,0.22)] border-l-4 border-l-terracotta" },
    medium: { label: "Worth a look", Icon: AlertTriangle, chip: "bg-gold text-white", tint: "bg-[rgba(224,166,75,0.08)] border-[rgba(224,166,75,0.30)] border-l-4 border-l-gold" },
    low: { label: "For your info", Icon: Info, chip: "bg-sage text-white", tint: "bg-[rgba(62,106,76,0.06)] border-[rgba(62,106,76,0.24)] border-l-4 border-l-sage" },
};

export default function FlagCard({
    idx = 0,
    severity = "medium",
    title,
    detail,
    action,
    dollarImpact,
    onDraftLetter,
    draftBusy = false,
    testId,
}) {
    const [open, setOpen] = useState(false);
    const meta = SEV[severity] || SEV.medium;
    const heading = cleanTitle(title);
    const explanation = plainBody(detail, 340);
    const step = plainBody(action, 300);
    const hasBody = Boolean(explanation) || Boolean(step) || Boolean(onDraftLetter);

    return (
        <li className={`rounded-xl border ${meta.tint}`} data-testid={testId}>
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
                            <span className="text-[11px] rounded-full bg-terracotta/10 text-terracotta px-2 py-0.5 font-semibold tabular-nums" data-testid={testId ? `${testId}-impact` : undefined}>
                                Could affect ${Number(dollarImpact).toFixed(2)}
                            </span>
                        )}
                    </span>
                    <span className="mt-1 block font-semibold text-primary-k text-[15px] leading-snug">{heading}</span>
                </span>
                <ChevronDown className={`h-4 w-4 flex-none text-muted-k transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && hasBody && (
                <div className="px-4 pb-4 -mt-1 space-y-3" data-testid={testId ? `${testId}-body` : undefined}>
                    {explanation && <p className="text-sm text-primary-k/90 leading-relaxed">{explanation}</p>}
                    {step && (
                        <div className="flex items-start gap-2 rounded-lg bg-gold/10 border border-gold/30 px-3 py-2.5">
                            <Lightbulb className="h-4 w-4 text-gold flex-none mt-0.5" />
                            <div className="text-[13px] text-primary-k"><span className="font-semibold">What to do: </span>{step}</div>
                        </div>
                    )}
                    {onDraftLetter && (
                        <button
                            type="button"
                            onClick={onDraftLetter}
                            disabled={draftBusy}
                            data-testid={testId ? `${testId}-draft-letter` : undefined}
                            className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white text-[13px] font-semibold px-4 py-2 hover:bg-[#091D33] disabled:opacity-60 transition-colors"
                        >
                            <PenLine className="h-3.5 w-3.5" />
                            {draftBusy ? "Starting letter\u2026" : "Draft a letter about this"}
                        </button>
                    )}
                </div>
            )}
        </li>
    );
}
