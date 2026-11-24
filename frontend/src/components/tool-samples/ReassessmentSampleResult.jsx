import React from "react";
import { Copy, Download } from "lucide-react";
import ToolSampleShell from "@/components/tool-samples/ToolSampleShell";

// Worked example for the Reassessment Letter Drafter, a real drafted letter
// (captured from POST /api/public/reassessment-letter) for the Sam Burke case.
const LETTER = `Dear My Aged Care Assessment Team,

I am writing to request a reassessment of the classification for my family member, Sam Burke (date of birth: [INSERT DOB], reference number: [INSERT REF NUMBER IF KNOWN]).

Sam is currently classified as Classification 6. Since the most recent assessment, there have been significant changes in Sam's functional capacity that I believe warrant a review of the current classification.

Sam has had two falls in the last three months. After the most recent fall, Sam was admitted to Example Hospital and discharged in October. Since returning home, Sam's care needs have increased considerably.

Sam now requires hands-on physical assistance every morning to shower and dress safely. Sam is no longer able to prepare meals independently and needs support to attend medical appointments and other essential outings.

An occupational therapist has reviewed Sam's situation and recommended daily personal care support. This recommendation reflects the genuine change in Sam's day-to-day needs.

Given the decline in Sam's mobility, self-care ability and meal preparation, I am asking you to consider whether Classification 6 still accurately reflects the level of support Sam now requires to remain living safely at home.

I would be grateful if you could arrange a reassessment at your earliest opportunity. I look forward to your response within 14 days.

Yours sincerely,

Alex Burke
Family Caregiver for Sam Burke`;

export default function ReassessmentSampleResult() {
    return (
        <ToolSampleShell
            testid="reassessment-sample-output"
            titleLead="See the Letter Wayly"
            titleAccent="Drafts For You"
            description="A worked example built from a few plain answers about what has changed. This is exactly what the drafter hands you: a ready-to-send letter in the right tone, citing the current framework, with clear placeholders for the details only you can fill in, copy it or download it and send."
            ctaTitle="Draft Your Own Letter In A Minute"
            ctaBody="Answer a few questions about what's changed and Wayly writes the reassessment request for you, grounded in the current rules, ready to copy, download or email."
        >
            <div className="rounded-2xl border border-kindred bg-surface overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-kindred bg-surface-2 px-5 py-3">
                    <span className="overline text-muted-k">Classification reassessment letter</span>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-3 py-1.5 text-xs font-medium text-primary-k"><Copy className="h-3.5 w-3.5" /> Copy</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-k px-3 py-1.5 text-xs font-medium text-white"><Download className="h-3.5 w-3.5" /> Download</span>
                    </div>
                </div>
                <div className="p-6 sm:p-8">
                    <p className="whitespace-pre-line text-[15px] leading-relaxed text-primary-k" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }} data-testid="reassessment-sample-letter">
                        {LETTER}
                    </p>
                </div>
            </div>
        </ToolSampleShell>
    );
}
