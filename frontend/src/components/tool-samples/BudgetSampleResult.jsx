import React from "react";
import ToolSampleShell, { aud, aud2 } from "@/components/tool-samples/ToolSampleShell";

// Worked example for the Budget Calculator — real engine output for a
// Classification 6 participant (captured from POST /api/public/budget-calc).
const R = {
    annual_total: 49461.91,
    quarterly_gross: 12365.48,
    care_management_quarterly: 1236.55,
    quarterly_usable: 11128.93,
    rollover_cap: 1122.04,
    lifetime_cap: 140652.8,
    streams: [
        { stream: "Clinical", allocated: 4451.57 },
        { stream: "Independence", allocated: 3895.13 },
        { stream: "Everyday Living", allocated: 2782.23 },
    ],
};

export default function BudgetSampleResult() {
    const usablePct = Math.round((R.quarterly_usable / R.quarterly_gross) * 100);
    const cmPct = 100 - usablePct;
    const maxAlloc = Math.max(...R.streams.map((s) => s.allocated));
    const barColors = ["#0E4D52", "#A5512B", "#425F47"];
    return (
        <ToolSampleShell
            testid="budget-sample-output"
            titleLead="See Your Support at Home Budget"
            titleAccent="Laid Out Clearly"
            description="A worked example for a Classification 6 participant. This is exactly what the Budget Calculator shows you: your quarterly budget, the slice the provider takes for care management, what's left for care, and how it splits across the three streams."
            ctaTitle="Work Out Your Own Budget In Seconds"
            ctaBody="Pick your classification and Wayly shows your real quarterly budget, your usable funds, rollover room and lifetime cap — then tracks your spend against it on any paid plan."
        >
            <div className="rounded-2xl border border-kindred bg-surface-2/40 p-5">
                <div className="text-xs uppercase tracking-[0.14em] font-semibold text-muted-k mb-3">Classification 6 · indicative</div>
                <div className="grid sm:grid-cols-3 gap-4">
                    <div className="rounded-xl p-5 text-white shadow-sm" style={{ backgroundColor: "#A5512B" }}>
                        <div className="text-xs uppercase tracking-[0.14em] font-semibold text-white/70">Gross quarterly</div>
                        <div className="mt-2 font-heading text-3xl text-white tabular-nums">{aud2(R.quarterly_gross)}</div>
                        <div className="text-xs text-white/75 mt-1.5">The figure printed on your statement (annual ÷ 4).</div>
                    </div>
                    <div className="rounded-xl p-5 text-white shadow-sm" style={{ backgroundColor: "#0E4D52" }}>
                        <div className="text-xs uppercase tracking-[0.14em] font-semibold text-white/70">Care management (10%)</div>
                        <div className="mt-2 font-heading text-3xl text-white tabular-nums">−{aud2(R.care_management_quarterly)}</div>
                        <div className="text-xs text-white/75 mt-1.5">Provider&apos;s care management slice.</div>
                    </div>
                    <div className="rounded-xl p-5 text-white shadow-sm" style={{ backgroundColor: "#425F47" }}>
                        <div className="text-xs uppercase tracking-[0.14em] font-semibold text-white/70">Usable for services</div>
                        <div className="mt-2 font-heading text-3xl text-white tabular-nums">{aud2(R.quarterly_usable)}</div>
                        <div className="text-xs text-white/75 mt-1.5">What you can spend on care this quarter.</div>
                    </div>
                </div>

                <div className="panel-sage rounded-xl p-5 mt-4">
                    <div className="text-xs uppercase tracking-[0.16em] font-semibold text-sage">How your quarterly budget splits</div>
                    <p className="text-sm text-primary-k mt-1.5 leading-relaxed">
                        Of your <strong>{aud2(R.quarterly_gross)}</strong> gross budget each quarter, <strong className="text-sage">{usablePct}%</strong> is yours to spend on care and <strong className="text-clay-k">{cmPct}%</strong> goes to the provider for care management.
                    </p>
                    <div className="mt-3 h-8 w-full rounded-lg overflow-hidden flex text-[11px] font-semibold">
                        <div className="h-full flex items-center justify-center text-white" style={{ width: `${usablePct}%`, backgroundColor: "#425F47" }}>{usablePct}%</div>
                        <div className="h-full flex items-center justify-center text-white" style={{ width: `${cmPct}%`, backgroundColor: "#A5512B" }}>{cmPct}%</div>
                    </div>
                </div>

                <div className="sect-teal border border-kindred rounded-xl p-5 mt-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="overline">Per-stream quarterly allocation (indicative)</div>
                        <span className="text-xs rounded-full bg-gold/25 text-[#6B4A0F] border border-gold/60 font-semibold px-2.5 py-1">Indicative split</span>
                    </div>
                    <div className="mt-3 space-y-3">
                        {R.streams.map((s, si) => {
                            const pct = Math.max(2, (s.allocated / maxAlloc) * 100);
                            return (
                                <div key={s.stream} className="rounded-lg item-teal border p-3">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-sm text-primary-k">{s.stream}</span>
                                        <span className="font-heading text-lg text-primary-k tabular-nums">{aud2(s.allocated)}</span>
                                    </div>
                                    <div className="mt-2 h-2.5 w-full rounded-full bg-primary-k/10 overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColors[si % 3] }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                    <div className="sect-teal border border-kindred rounded-xl p-4 flex items-baseline justify-between">
                        <span className="text-sm text-muted-k">Annual budget</span>
                        <span className="font-heading text-lg text-primary-k tabular-nums">{aud(R.annual_total)}</span>
                    </div>
                    <div className="panel-teal rounded-xl p-4 flex items-baseline justify-between">
                        <span className="text-sm text-primary-k">Rollover you can carry over</span>
                        <span className="font-heading text-lg text-primary-k tabular-nums">{aud2(R.rollover_cap)}</span>
                    </div>
                </div>
            </div>
        </ToolSampleShell>
    );
}
