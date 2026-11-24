import React from "react";
import { MessageSquare, Sparkles } from "lucide-react";
import ToolSampleShell from "@/components/tool-samples/ToolSampleShell";

// Worked example for Aged Care Q&A, a real question + the real assistant
// reply (captured from POST /api/public/aged-care-chat).
const QUESTION = "My mum is on a full pension and just moved to Support at Home. Do we have to pay for her personal care and nursing visits?";
const REPLY_PARAS = [
    "From **1 October 2026**, personal care under Support at Home is **fully government-funded** (the participant contribution is $0). That change applies automatically, no reassessment needed. Nursing also sits in the Clinical Supports category, so if she has available funds allocated to that category, there's no participant contribution for nursing either.",
    "**Before 1 October 2026**, personal care fell under Independence and attracted the **5% participant contribution** for full pensioners. If you're seeing invoices dated before that, the 5% is correct.",
    "**Other contributions remain unchanged**: the **5% Independence contribution** still applies to things like gardening, transport, and home modifications. The **20% Everyday Living contribution** still applies to social activities, meal services, and similar supports.",
    "**Next step:** If you're seeing personal care charges on a statement dated on or after 1 October 2026, contact the provider, they may not have updated their pricing yet.",
];

function Rich({ text }) {
    // Minimal **bold** renderer for the sample reply.
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
        <>
            {parts.map((p, i) =>
                p.startsWith("**") && p.endsWith("**") ? (
                    <strong key={i} className="font-semibold text-primary-k">{p.slice(2, -2)}</strong>
                ) : (
                    <React.Fragment key={i}>{p}</React.Fragment>
                )
            )}
        </>
    );
}

export default function QaSampleResult() {
    return (
        <ToolSampleShell
            testid="qa-sample-output"
            titleLead="See the Kind of Answer"
            titleAccent="You'll Get"
            description="A worked example of a real question and answer. Ask anything about Support at Home, fees, contributions, what changed and when, and get a clear, plain-English answer grounded in the current rules, with a next step you can act on."
            ctaTitle="Ask Your Own Question"
            ctaBody="Sign in and the assistant answers with your household context, your plan, your classification and your statements, so the answer is specific to your situation."
        >
            <div className="rounded-2xl border border-kindred bg-surface p-5 sm:p-6">
                <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary-k text-white px-4 py-3 text-sm leading-relaxed" data-testid="qa-sample-question">
                        {QUESTION}
                    </div>
                </div>
                <div className="mt-4 flex gap-3">
                    <span className="h-8 w-8 flex-none rounded-full bg-gold/20 flex items-center justify-center"><Sparkles className="h-4 w-4 text-[#A5512B]" /></span>
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 border border-kindred px-4 py-3 space-y-3" data-testid="qa-sample-answer">
                        {REPLY_PARAS.map((p, i) => (
                            <p key={i} className="text-sm text-primary-k leading-relaxed"><Rich text={p} /></p>
                        ))}
                    </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-k">
                    <MessageSquare className="h-3.5 w-3.5" /> Grounded in the current Support at Home rules. Not personal financial advice.
                </div>
            </div>
        </ToolSampleShell>
    );
}
