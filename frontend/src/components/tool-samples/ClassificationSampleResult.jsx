import React from "react";
import { Sparkles } from "lucide-react";
import ToolSampleShell, { aud } from "@/components/tool-samples/ToolSampleShell";

// Worked example for the Classification Self-Check, real output
// (captured from POST /api/public/csc/run) for a higher-needs profile.
const C = {
    primary: 6,
    range_low: 4,
    range_high: 8,
    confidence: "low",
    annual_low: 30528,
    annual_high: 80294,
    quarter_low: 7632,
    quarter_high: 20074,
    headline: "Very high support",
    plain: "Needs help with almost everything, close supervision, and regular clinical care.",
};
const DRIVERS = [
    "Cannot manage cleaning or laundry alone",
    "Cannot shop for groceries without help",
    "Cannot get to appointments without support",
];

export default function ClassificationSampleResult() {
    const weekLow = aud(Math.round(C.annual_low / 52));
    const weekHigh = aud(Math.round(C.annual_high / 52));
    const levels = [1, 2, 3, 4, 5, 6, 7, 8];
    return (
        <ToolSampleShell
            testid="classification-sample-output"
            titleLead="See the Funding Level Your"
            titleAccent="Answers Point To"
            description="A worked example from a higher-needs set of answers. This is exactly what the Self-Check shows you: your indicative band on the 1–8 scale, the yearly, quarterly and weekly funding it carries, and the answers that drove the result, in plain English, no clinical jargon."
            ctaTitle="Check Your Own Likely Classification"
            ctaBody="Answer 16 short questions about everyday tasks and Wayly maps them to an indicative Support at Home band and budget, a starting point before your real assessment."
        >
            <div className="rounded-3xl section-teal p-7 sm:p-9 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 mb-5">
                    <span className="text-xs font-semibold bg-white/15 text-white rounded-full px-3 py-1">Confidence: {C.confidence}</span>
                </div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/60">Your indicative band</div>
                <div className="mt-2 font-heading text-4xl sm:text-6xl text-white tracking-tight leading-none">Classification {C.range_low} to {C.range_high}</div>
                <div className="mt-3 text-lg text-white font-medium">{C.headline}</div>
                <p className="mt-3 text-base text-white/85 leading-relaxed max-w-2xl">{C.plain}</p>

                <div className="mt-7">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/55 mb-2">
                        <span>Lower needs</span>
                        <span>Higher needs</span>
                    </div>
                    <div className="flex items-end gap-1.5 sm:gap-2">
                        {levels.map((n) => {
                            const inRange = n >= C.range_low && n <= C.range_high;
                            const isPrimary = n === C.primary;
                            return (
                                <div key={n} className="flex-1 flex flex-col items-center gap-1.5 rounded-lg pt-1 pb-0.5">
                                    <div className={`w-full rounded-full ${isPrimary ? "bg-gold h-9 shadow-[0_0_0_2px_rgba(255,255,255,0.35)]" : inRange ? "bg-[#8FBF95] h-6" : "bg-white/15 h-3.5"}`} />
                                    <span className={`text-[11px] tabular-nums ${isPrimary ? "text-gold font-bold" : inRange ? "text-white font-semibold" : "text-white/40"}`}>{n}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/12 p-4 border-l-4 border-gold">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/70"><span className="h-2 w-2 rounded-full bg-gold" /> Per year</div>
                        <div className="mt-1.5 font-heading text-2xl text-white tabular-nums">{aud(C.annual_low)} <span className="text-white/50 text-base">to</span> {aud(C.annual_high)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/12 p-4 border-l-4 border-[#8FBF95]">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/70"><span className="h-2 w-2 rounded-full bg-[#8FBF95]" /> Per quarter</div>
                        <div className="mt-1.5 font-heading text-2xl text-white tabular-nums">{aud(C.quarter_low)} <span className="text-white/50 text-base">to</span> {aud(C.quarter_high)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/12 p-4 border-l-4 border-[#A3CBCC]">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/70"><span className="h-2 w-2 rounded-full bg-[#A3CBCC]" /> Per week</div>
                        <div className="mt-1.5 font-heading text-2xl text-white tabular-nums">{weekLow} <span className="text-white/50 text-base">to</span> {weekHigh}</div>
                    </div>
                </div>
                <p className="mt-4 text-xs text-white/70 leading-relaxed max-w-2xl">
                    Higher classifications fund more care. The government pays most of this amount; your share depends on your income. These are indicative figures based on the answers.
                </p>
            </div>

            <div className="rounded-3xl bg-surface border-2 border-gold/40 p-6 sm:p-7 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <span className="h-8 w-8 rounded-full bg-gold/20 flex items-center justify-center"><Sparkles className="h-4 w-4 text-[#A5512B]" /></span>
                    <span className="font-heading text-lg text-primary-k">Wayly Summary</span>
                </div>
                <p className="text-sm text-primary-k leading-relaxed">
                    Based on the answers, this looks like someone who needs <strong>very high support</strong>, help with almost everything, close supervision and regular clinical care. That points to around <strong>{weekLow}–{weekHigh} a week</strong> in Support at Home funding, most of it paid by the government. Because a few answers were left as &quot;not sure&quot;, the band is shown as a range. The strongest drivers were:
                </p>
                <ul className="mt-3 space-y-1.5">
                    {DRIVERS.map((d) => (
                        <li key={d} className="flex items-start gap-2 text-sm text-primary-k"><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#A5512B] flex-none" /> {d}</li>
                    ))}
                </ul>
            </div>
        </ToolSampleShell>
    );
}
