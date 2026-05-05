import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolGate from "@/components/ToolGate";
import { ScreenshotStatement } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import { api, formatAUD2, formatAUD } from "@/lib/api";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";

const PENSION = [
    { v: "full", label: "Full pension", sub: "Lowest contribution rates" },
    { v: "part", label: "Part pension", sub: "Mid-tier rates" },
    { v: "self", label: "Self-funded", sub: "Highest rates" },
];

export default function ContributionEstimator() {
    const access = useToolAccess();
    const [form, setForm] = useState({
        classification: 4,
        pension_status: "full",
        is_grandfathered: false,
        expected_mix_clinical_pct: 30,
        expected_mix_independence_pct: 45,
        expected_mix_everyday_pct: 25,
    });
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setLoading(true);
        try {
            const { data } = await api.post("/public/contribution-estimator", form);
            setResult(data);
        } finally { setLoading(false); }
    };

    if (access === "loading") return (<div className="min-h-screen bg-kindred"><MarketingHeader /><div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div><Footer /></div>);
    if (access === "blocked") return (<div className="min-h-screen bg-kindred"><MarketingHeader /><ToolGate toolName="Contribution Estimator"><ScreenshotStatement /></ToolGate><Footer /></div>);

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Free tool · 5 uses per hour</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Contribution Estimator</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">How much will the participant actually pay each quarter under Support at Home? Enter the situation and see a clear breakdown.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-20">
                <AIAccuracyBanner text={TOOL_DISCLAIMERS["contribution-estimator"]} className="mb-4" />
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-5" data-testid="contribution-form">
                    <label className="block"><span className="text-sm text-muted-k">Classification</span>
                        <select value={form.classification} onChange={(e) => setForm((f) => ({ ...f, classification: parseInt(e.target.value) }))} data-testid="ce-class" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5">
                            {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>Classification {n}</option>)}
                        </select>
                    </label>
                    <div>
                        <span className="text-sm text-muted-k">Pension status</span>
                        <div className="mt-2 grid sm:grid-cols-3 gap-2">
                            {PENSION.map((p) => (
                                <button key={p.v} type="button" onClick={() => setForm((f) => ({ ...f, pension_status: p.v }))} data-testid={`ce-pension-${p.v}`} className={`rounded-lg border p-3 text-left transition-colors ${form.pension_status === p.v ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"}`}>
                                    <div className="font-medium text-primary-k">{p.label}</div>
                                    <div className="text-xs text-muted-k mt-0.5">{p.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <span className="text-sm text-muted-k">Expected service mix (must sum to 100%)</span>
                        <div className="mt-2 grid sm:grid-cols-3 gap-3">
                            {[
                                { k: "expected_mix_clinical_pct", l: "Clinical %" },
                                { k: "expected_mix_independence_pct", l: "Independence %" },
                                { k: "expected_mix_everyday_pct", l: "Everyday %" },
                            ].map(({ k, l }) => (
                                <label key={k} className="block">
                                    <span className="text-xs text-muted-k">{l}</span>
                                    <input type="number" min="0" max="100" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))} data-testid={`ce-${k}`} className="mt-1 w-full rounded-md border border-kindred px-3 py-2 tabular-nums focus:outline-none focus:ring-2 ring-primary-k" />
                                </label>
                            ))}
                        </div>
                        <div className="text-xs text-muted-k mt-1">Sum: {form.expected_mix_clinical_pct + form.expected_mix_independence_pct + form.expected_mix_everyday_pct}%</div>
                    </div>
                    <label className="flex items-center gap-3 rounded-lg border border-kindred p-3">
                        <input type="checkbox" checked={form.is_grandfathered} onChange={(e) => setForm((f) => ({ ...f, is_grandfathered: e.target.checked }))} data-testid="ce-grand" className="h-4 w-4 accent-[var(--kindred-primary)]" />
                        <span className="text-sm text-primary-k">Grandfathered (was on HCP before 1 Nov 2025)</span>
                    </label>
                    <button onClick={submit} disabled={loading} data-testid="ce-submit" className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Estimate contribution
                    </button>
                </div>

                {result && (
                    <div className="mt-6 space-y-5 animate-fade-up" data-testid="ce-result">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Annual contribution</div>
                                <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">{formatAUD2(result.annual_contribution)}</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Per quarter</div>
                                <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">{formatAUD2(result.quarterly_contribution)}</div>
                            </div>
                        </div>
                        <div className="bg-surface border border-kindred rounded-xl p-5">
                            <div className="overline">By stream</div>
                            <ul className="mt-3 space-y-2 text-sm">
                                {result.per_stream.map((s) => (
                                    <li key={s.stream} className="flex items-baseline justify-between border-b border-kindred pb-2 last:border-0">
                                        <span className="text-primary-k">{s.stream} <span className="text-muted-k tabular-nums">({s.rate_pct.toFixed(1)}% rate)</span></span>
                                        <span className="font-heading text-base text-primary-k tabular-nums">{formatAUD2(s.annual_contribution)}/yr</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {result.years_to_cap && (
                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <p className="text-sm text-primary-k">At this contribution rate, the participant would reach the lifetime cap ({formatAUD(result.lifetime_cap)}) in approximately <span className="font-medium tabular-nums">{result.years_to_cap} years</span>.</p>
                            </div>
                        )}
                        <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                            <div className="font-medium text-primary-k">Want this updated automatically as charges come in?</div>
                            <Link to="/signup" className="mt-3 inline-flex items-center gap-1 text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]">Start free trial <ArrowRight className="h-3.5 w-3.5" /></Link>
                        </div>
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}
