import React from "react";
import { HelpCircle } from "lucide-react";
import ToolSampleShell, { aud2 } from "@/components/tool-samples/ToolSampleShell";

// Worked example for the Provider Price Checker, real output
// (captured from POST /api/public/price-check-v2) for domestic assistance
// charged above the Department of Health indicative range.
const R = {
    service: "Domestic assistance",
    charged: 118.0,
    median: 95.0,
    lower: 83.0,
    upper: 109.0,
    unit: "hour",
    stream: "Everyday Living",
    plain_language: "Your rate of $118.00 per hour is above the published range of $83.00 to $109.00 for domestic assistance.",
    distance_summary: "That is $9.00 above the top of the published range.",
    source_date: "1 Oct 2025",
};

export default function PriceSampleResult() {
    const diffPct = Math.round(((R.charged - R.median) / R.median) * 100);
    const domain = Math.max(R.charged, R.median, R.upper) * 1.1;
    const pctOf = (v) => Math.min(100, Math.max(2, (v / domain) * 100));
    const Bar = ({ label, value, color }) => (
        <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-muted-k text-right">{label}</span>
            <div className="flex-1 min-w-0 h-7 rounded-lg bg-primary-k/5 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${pctOf(value)}%`, backgroundColor: color }} />
            </div>
            <span className="w-[86px] shrink-0 text-right text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color }}>{aud2(value)}<span className="font-normal text-muted-k">/{R.unit}</span></span>
        </div>
    );
    return (
        <ToolSampleShell
            testid="price-sample-output"
            titleLead="See How a Provider's Rate"
            titleAccent="Compares"
            description="A worked example checking a provider's domestic assistance rate. This is exactly what the Price Checker shows you: a plain verdict against the Department of Health's published range, how far above or below it sits, and a visual of your rate versus the typical market price."
            ctaTitle="Check Any Rate On Your Invoice"
            ctaBody="Pick a service, enter the rate your provider charges, and Wayly compares it against the latest Department of Health indicative ranges and shows your likely share."
        >
            <div className="rounded-2xl border border-kindred border-l-4 border-l-[#0E4D52] bg-[#0E4D52]/[0.06] p-6">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="overline text-muted-k">How this compares</div>
                        <div className="mt-2 font-heading text-2xl sm:text-3xl leading-tight break-words text-[#B23A2E]">{R.plain_language}</div>
                        <div className="mt-2 text-primary-k tabular-nums">{R.distance_summary}</div>
                    </div>
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-[#A5512B]/10 text-[#A5512B]">{R.stream} <HelpCircle className="h-3 w-3 ml-1 opacity-70" /></span>
                </div>

                <div className="mt-5 rounded-2xl bg-surface border border-kindred p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                        <span className="text-xs uppercase tracking-wider text-muted-k">What your provider charges vs typical</span>
                        <span className="text-xs font-semibold text-white bg-[#B23A2E] rounded-full px-2.5 py-0.5">Above the indicative range</span>
                    </div>
                    <p className="text-sm text-primary-k mb-4 leading-relaxed">
                        You pay <strong>{aud2(R.charged)}/{R.unit}</strong>. That is <strong style={{ color: "#B23A2E" }}>{Math.abs(diffPct)}% more than</strong> the typical rate of {aud2(R.median)}/{R.unit}.
                    </p>
                    <div className="space-y-2.5">
                        <Bar label="You pay" value={R.charged} color="#B23A2E" />
                        <Bar label="Typical median" value={R.median} color="#0E4D52" />
                        <div className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-xs text-muted-k text-right">Usual range</span>
                            <div className="flex-1 min-w-0 h-7 rounded-lg bg-primary-k/5 relative overflow-hidden">
                                <div className="absolute inset-y-0 rounded-lg bg-[#425F47]/30 border border-[#425F47]/40" style={{ left: `${pctOf(R.lower)}%`, width: `${Math.max(6, pctOf(R.upper) - pctOf(R.lower))}%` }} />
                            </div>
                            <span className="w-[86px] shrink-0 text-right text-xs font-semibold text-[#2f4633] tabular-nums whitespace-nowrap">{aud2(R.lower)}–{aud2(R.upper)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
                <div className="bg-[#B23A2E]/[0.10] border-y border-r border-kindred border-l-[5px] border-l-[#B23A2E] rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-k">You are charged</div>
                    <div className="mt-1 text-2xl text-primary-k tabular-nums">{aud2(R.charged)}<span className="text-sm text-muted-k"> /{R.unit}</span></div>
                </div>
                <div className="bg-[#0E4D52]/[0.10] border-y border-r border-kindred border-l-[5px] border-l-[#0E4D52] rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-k">Typical median</div>
                    <div className="mt-1 text-2xl text-primary-k tabular-nums">{aud2(R.median)}<span className="text-sm text-muted-k"> /{R.unit}</span></div>
                </div>
                <div className="bg-[#5F4E76]/[0.10] border-y border-r border-kindred border-l-[5px] border-l-[#5F4E76] rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-k">Indicative range</div>
                    <div className="mt-1 text-2xl text-primary-k tabular-nums">{aud2(R.lower)} to {aud2(R.upper)}</div>
                    <div className="text-xs text-muted-k mt-0.5">DoH {R.source_date}</div>
                </div>
            </div>

            <div className="text-sm bg-surface-2 border border-kindred rounded-xl p-4 text-primary-k leading-relaxed">
                <span className="font-medium">Price caps deferred. </span>
                The Australian Government has deferred the planned national provider price caps indefinitely. Providers set their own prices. This compares your provider&apos;s rate against the indicative ranges published by the Department of Health, not a government cap.
            </div>
        </ToolSampleShell>
    );
}
