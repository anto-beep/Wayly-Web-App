import React from "react";
import ToolSampleShell, { aud2 } from "@/components/tool-samples/ToolSampleShell";

// Worked example for the Contribution Estimator, real output
// (captured from POST /api/ce2/calculate) for Sam Burke: full pension,
// single homeowner, Classification 6.
const R = {
    weekly: 62.84,
    annual: 3276.85,
    quarterly: 819.21,
    govt_annual: 46185.06,
    govt_pct: 93.38,
};
const CATS = [
    { key: "clinical", label: "Clinical care", note: "Nursing, physio, allied health", soft: "#EEF3EE", bar: "#425F47", budget: 3709.64, you: 0, govt: 3709.64, rate: 0 },
    { key: "independence", label: "Independence", note: "Personal care, meals, transport", soft: "#E9F2F2", bar: "#0E4D52", budget: 5564.46, you: 278.22, govt: 5286.24, rate: 5 },
    { key: "everyday", label: "Everyday living", note: "Cleaning, gardening, shopping", soft: "#FBEEE7", bar: "#A5512B", budget: 3091.37, you: 540.99, govt: 2550.38, rate: 17.5 },
];

export default function ContributionSampleResult() {
    const totalBudget = CATS.reduce((s, r) => s + r.budget, 0);
    const totalYou = CATS.reduce((s, r) => s + r.you, 0);
    const totalGovt = CATS.reduce((s, r) => s + r.govt, 0);
    return (
        <ToolSampleShell
            testid="contribution-sample-output"
            titleLead="See What You'd Actually Pay"
            titleAccent="Towards Your Care"
            description="A worked example for a full-pension, Classification 6 participant. This is exactly what the Estimator shows you: your weekly contribution, how much the government covers, and a plain breakdown of who pays what across clinical, independence and everyday living care."
            ctaTitle="Estimate Your Own Contribution"
            ctaBody="Answer a few questions about your pension, household and care mix and Wayly estimates your weekly and yearly contribution, the government share, and your rate by service type."
        >
            <div className="bg-primary-k text-white rounded-2xl p-8">
                <div className="text-xs uppercase tracking-[0.18em] text-white/70">Estimated weekly contribution</div>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-heading text-6xl tabular-nums">{aud2(R.weekly)}</span>
                    <span className="text-white/80 text-lg">/ week</span>
                </div>
                <div className="mt-2 text-sm text-white/80 tabular-nums">{aud2(R.annual)} a year · {aud2(R.quarterly)} a quarter</div>
                <div className="mt-4 text-sm text-white/85">
                    The government covers the rest: it pays <span className="font-semibold">{aud2(R.govt_annual)}</span> a year, that is <span className="tabular-nums font-semibold">{R.govt_pct.toFixed(1)}%</span> of the total.
                </div>
            </div>

            <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-4">
                <div>
                    <div className="text-xs uppercase tracking-wider text-muted-k">Where your budget goes</div>
                    <p className="text-sm text-muted-k mt-0.5">How your Support at Home budget splits each quarter, and who pays for each part.</p>
                </div>
                <div className="space-y-3">
                    {CATS.map((r) => {
                        const youPct = r.budget > 0 ? Math.min(100, (r.you / r.budget) * 100) : 0;
                        return (
                            <div key={r.key} className="rounded-xl border border-kindred p-4" style={{ backgroundColor: r.soft }}>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium text-primary-k whitespace-nowrap">{r.label}</div>
                                        <div className="text-xs text-muted-k">{r.note}</div>
                                    </div>
                                    <div className="text-left sm:text-right shrink-0">
                                        <div className="font-heading text-lg text-primary-k tabular-nums leading-none">{aud2(r.budget)}</div>
                                        <div className="text-[11px] text-muted-k">in your budget a quarter</div>
                                    </div>
                                </div>
                                <div className="mt-3 h-2.5 w-full rounded-full overflow-hidden flex">
                                    <div className="h-full" style={{ width: `${youPct}%`, backgroundColor: r.bar }} />
                                    <div className="h-full flex-1" style={{ backgroundColor: "rgba(66,95,71,0.25)" }} />
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                                    <span className="text-primary-k"><span className="font-semibold tabular-nums">{aud2(r.you)}</span> you {r.rate > 0 ? `(${r.rate}%)` : "(free)"}</span>
                                    <span className="text-muted-k"><span className="font-semibold tabular-nums">{aud2(r.govt)}</span> government</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="rounded-xl bg-primary-k text-white p-4 grid grid-cols-1 sm:grid-cols-3 gap-y-2 sm:gap-2">
                    <div className="flex items-baseline justify-between gap-2 sm:block">
                        <div className="text-[11px] uppercase tracking-wider text-white/70">Total budget</div>
                        <div className="font-heading text-xl tabular-nums">{aud2(totalBudget)}</div>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 sm:block">
                        <div className="text-[11px] uppercase tracking-wider text-white/70">You pay</div>
                        <div className="font-heading text-xl tabular-nums">{aud2(totalYou)}</div>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 sm:block">
                        <div className="text-[11px] uppercase tracking-wider text-white/70">Government</div>
                        <div className="font-heading text-xl tabular-nums">{aud2(totalGovt)}</div>
                    </div>
                </div>
            </div>
        </ToolSampleShell>
    );
}
