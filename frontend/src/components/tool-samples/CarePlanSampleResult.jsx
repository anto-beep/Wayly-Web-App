import React from "react";
import { AlertTriangle, Info, CheckCircle2, FileText } from "lucide-react";
import ToolSampleShell from "@/components/tool-samples/ToolSampleShell";

// Worked example for the Support Plan Reviewer — real AI output
// (captured from POST /api/public/care-plans/review-files-async) for the
// Sam Burke sample support plan (Classification 6, Blueberry Care).
const SUMMARY = "This is a Support at Home support plan for Sam Burke, who is on Classification 6, managed by Blueberry Care Pty Ltd, working against a quarterly budget of $12,365.48. Wayly read the plan and checked it against the Support at Home rules, the Statement of Rights and the budget for this classification. The plan meets the core compliance checks — here are seven things worth raising with the provider before the next review.";

const FINDINGS = [
    {
        sev: "compliance", cat: "Budget",
        title: "Care management fee at the maximum 10%",
        detail: "The plan charges care management at 10% of the quarterly budget, the maximum allowed under the Aged Care Rules 2025. This is compliant, but it is worth understanding what the fee includes and whether a lower percentage is available.",
        q: "You are charging the maximum 10% care management fee. Can you explain what is included in that fee and whether a lower percentage is available?",
        cite: "Aged Care Rules 2025 (F2025L01173) s.194-3",
    },
    {
        sev: "compliance", cat: "Clinical",
        title: "Clinical hours may be insufficient for Classification 6",
        detail: "Sam receives 4.5 clinical hours per week (personal care, nursing, physiotherapy). Classification 6 typically requires higher clinical intensity to meet assessed needs. This volume may not align with the classification level.",
        q: "Sam is classified at level 6. Can you explain how 4.5 clinical hours per week meets the assessed needs for that classification?",
        cite: "Aged Care Rules 2025 (F2025L01173) s.194-5(1)(c)",
    },
    {
        sev: "info", cat: "Budget",
        title: "Social support rate above the national midpoint",
        detail: "The plan charges $97.50 per hour for Saturday social support (after a 1.25x loading). The national midpoint is about $82 per hour. Weekend loadings are common, but this rate is 19% above the midpoint and worth discussing.",
        q: "The Saturday social support rate is $97.50 per hour, 19% above the national midpoint. Can you explain the weekend loading and whether weekday outings are possible at a lower rate?",
        cite: "Verification required",
    },
    {
        sev: "info", cat: "Clinical",
        title: "No medication management service listed",
        detail: "The plan includes weekly nursing visits but does not mention medication management or prompting. For a Classification 6 participant receiving regular clinical support, medication oversight is often part of safe care.",
        q: "Does Sam manage medication independently, or should medication prompting or packing be included in the nursing visits?",
        cite: "Verification required",
    },
    {
        sev: "info", cat: "Rights",
        title: "Statement of Rights not provided",
        detail: "The plan does not include or reference the Statement of Rights. Every participant must receive a copy in a format they understand before services start. This is mandatory under the Aged Care Act 2024.",
        q: "Can you confirm that Sam received a copy of the Statement of Rights, and can you provide us with a copy now?",
        cite: "Verification required",
    },
    {
        sev: "info", cat: "Service mix",
        title: "Social support only fortnightly despite a connection goal",
        detail: "Sam has a stated goal to stay connected with the community, but social support outings occur only once a fortnight. For Classification 6, social participation is often needed more frequently to prevent isolation.",
        q: "Sam wants to stay connected with the community. Would weekly social outings better support that goal, and does the budget allow for it?",
        cite: "Verification required",
    },
    {
        sev: "info", cat: "Review timing",
        title: "Reassessment triggers not listed",
        detail: "The plan does not state what will trigger a review before the scheduled date of 01/04/2027. Changes in health, a hospital discharge, or shifts in informal carer availability should all prompt a review.",
        q: "What changes in situation or health would trigger an earlier reassessment before April 2027?",
        cite: "Verification required",
    },
];

const SEV = {
    compliance: { label: "Compliance", Icon: AlertTriangle, chip: "bg-[#A5512B]/12 text-[#A5512B] border-[#A5512B]/30", left: "#A5512B" },
    info: { label: "Worth a look", Icon: Info, chip: "bg-[#0E4D52]/10 text-[#0E4D52] border-[#0E4D52]/25", left: "#0E4D52" },
};

export default function CarePlanSampleResult() {
    return (
        <ToolSampleShell
            testid="careplan-sample-output"
            titleLead="See What a Support Plan Review"
            titleAccent="Turns Up"
            description="A worked example from a real Classification 6 support plan. This is exactly what the reviewer shows you: a plain-English read of the plan, then every point worth raising — rates above the midpoint, gaps against the plan's own goals, and mandatory items missing — each with the exact question to ask and the rule it sits under."
            ctaTitle="Review Your Own Support Plan"
            ctaBody="Upload your Support at Home plan and Wayly checks it against the rules, the Statement of Rights and the budget for the classification, then drafts the questions to raise with your provider."
        >
            <div className="rounded-2xl bg-surface border border-kindred p-6">
                <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary-k" />
                    <span className="overline text-muted-k">Plan summary</span>
                </div>
                <p className="mt-2 text-sm text-primary-k leading-relaxed">{SUMMARY}</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#A5512B]/10 border border-[#A5512B]/25 px-3.5 py-1.5 text-sm font-semibold text-[#A5512B]">
                    <AlertTriangle className="h-4 w-4" /> 7 things worth raising
                </div>
            </div>

            <div className="space-y-3">
                {FINDINGS.map((f, i) => {
                    const s = SEV[f.sev] || SEV.info;
                    return (
                        <div key={i} className="rounded-2xl border border-kindred border-l-4 bg-surface p-5" style={{ borderLeftColor: s.left }} data-testid={`careplan-sample-finding-${i}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.chip}`}><s.Icon className="h-3 w-3" /> {s.label}</span>
                                <span className="text-xs text-muted-k">{f.cat}</span>
                            </div>
                            <div className="mt-2 font-heading text-lg text-primary-k leading-snug">{f.title}</div>
                            <p className="mt-1.5 text-sm text-muted-k leading-relaxed">{f.detail}</p>
                            <div className="mt-3 rounded-xl bg-surface-2 border border-kindred p-3">
                                <div className="text-[11px] uppercase tracking-wider text-muted-k mb-1">Question to ask your provider</div>
                                <p className="text-sm text-primary-k leading-relaxed">“{f.q}”</p>
                            </div>
                            <div className="mt-2 text-[11px] text-muted-k">Reference: {f.cite}</div>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center gap-2 text-sm text-sage">
                <CheckCircle2 className="h-4 w-4" /> Core compliance checks passed — budget, care management cap and classification all line up.
            </div>
        </ToolSampleShell>
    );
}
