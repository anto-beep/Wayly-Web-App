import React from "react";
import { Copy, Download, Mail } from "lucide-react";
import ToolSampleShell from "@/components/tool-samples/ToolSampleShell";

// Worked example for Letters & Follow-ups — a representative drafted reply for
// a common scenario (responding to a provider's fee-increase notice). Sample
// content, clearly labelled, showing the tool's letter-drafting output.
const LETTER = `Dear Blueberry Care team,

Thank you for your letter of 3 November 2026 advising that the hourly rate for domestic assistance will rise from $82.00 to $95.00 from 1 December 2026.

Before this change takes effect, I would like to understand a few things so we can plan Sam's budget for the coming quarter:

1. Could you confirm the 14 days written notice required under our service agreement has been met, and the exact date the new rate first applies?

2. Could you set out what has driven the increase, and whether the new rate still sits within the Department of Health's published indicative range for this service?

3. Could you let us know whether there is a lower-cost option for the same support, or any change to the hours so the quarterly budget is not exceeded?

We value the support Sam receives and simply want to make sure the change is correct and affordable within the Support at Home budget. I would be grateful for your reply before the new rate begins.

Kind regards,

Alex Burke
On behalf of Sam Burke`;

export default function LettersSampleResult() {
    return (
        <ToolSampleShell
            testid="letters-sample-output"
            titleLead="See the Follow-Up Letter"
            titleAccent="Wayly Writes"
            description="A worked example for a common situation — replying to a provider's fee-increase notice. This is exactly what Letters & Follow-ups hands you: a calm, clear letter that asks the right questions and references your agreement and the rules, ready to copy, download or email."
            ctaTitle="Draft Your Own Letter"
            ctaBody="Pick a situation — a reply, a complaint, a request — add a few notes, and Wayly drafts a considered letter in the right tone, every time."
        >
            <div className="rounded-2xl border border-kindred bg-surface overflow-hidden">
                <div className="flex flex-col items-start gap-3 border-b border-kindred bg-surface-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="inline-flex items-center gap-2 overline text-muted-k min-w-0"><Mail className="h-3.5 w-3.5 shrink-0" /> Reply to a message · fee increase</span>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-3 py-1.5 text-xs font-medium text-primary-k whitespace-nowrap"><Copy className="h-3.5 w-3.5 shrink-0" /> Copy</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-k px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap"><Download className="h-3.5 w-3.5 shrink-0" /> Download</span>
                    </div>
                </div>
                <div className="p-6 sm:p-8">
                    <p className="whitespace-pre-line text-[15px] leading-relaxed text-primary-k" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }} data-testid="letters-sample-letter">
                        {LETTER}
                    </p>
                </div>
            </div>
        </ToolSampleShell>
    );
}
