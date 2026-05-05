import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api, formatAUD, formatAUD2 } from "@/lib/api";
import { Loader2, ArrowRight, Sparkles } from "lucide-react";
import ToolGate from "@/components/ToolGate";
import { ScreenshotBudget } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";

const CLASSIFICATIONS = [
    { v: 1, annual: 10731 },
    { v: 2, annual: 15910 },
    { v: 3, annual: 22515 },
    { v: 4, annual: 29696 },
    { v: 5, annual: 39805 },
    { v: 6, annual: 49906 },
    { v: 7, annual: 60005 },
    { v: 8, annual: 78106 },
];

export default function BudgetCalculatorTool() {
    const access = useToolAccess();
    const [classification, setClassification] = useState(4);
    const [isGrandfathered, setIsGrandfathered] = useState(false);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [annualBurn, setAnnualBurn] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const calc = async () => {
        setLoading(true);
        try {
            const { data } = await api.post("/public/budget-calc", {
                classification,
                is_grandfathered: isGrandfathered,
                current_lifetime_balance: parseFloat(currentBalance) || 0,
                expected_annual_burn: parseFloat(annualBurn) || null,
            });
            setResult(data);
        } finally {
            setLoading(false);
        }
    };

    if (access === "loading") {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div>
                <Footer />
            </div>
        );
    }
    if (access === "blocked") {
        return (
            <div className="min-h-screen bg-kindred">
                <MarketingHeader />
                <section className="mx-auto max-w-4xl px-6 pt-8">
                    <AIAccuracyBanner text={TOOL_DISCLAIMERS["budget-calculator"]} />
                </section>
                <ToolGate toolName="Budget Calculator">
                    <ScreenshotBudget />
                </ToolGate>
                <Footer />
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Free tool · No signup</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Budget &amp; Lifetime Cap Calculator</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Enter your classification. We'll show your annual budget, per-stream allocations, lifetime cap progress, and rollover risk — using the actual Support at Home rules (10% care management, $1,000 rollover floor).
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20">
                <AIAccuracyBanner text={TOOL_DISCLAIMERS["budget-calculator"]} className="mb-4" />
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-5" data-testid="budget-calculator">
                    <div>
                        <span className="text-sm text-muted-k">Support at Home classification</span>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {CLASSIFICATIONS.map((c) => (
                                <button
                                    key={c.v}
                                    type="button"
                                    onClick={() => setClassification(c.v)}
                                    data-testid={`bc-class-${c.v}`}
                                    className={`rounded-lg border p-3 text-left transition-colors ${
                                        classification === c.v ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"
                                    }`}
                                >
                                    <div className="font-medium text-primary-k">Class {c.v}</div>
                                    <div className="text-xs text-muted-k mt-0.5 tabular-nums">{formatAUD(c.annual)}/yr</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="text-sm text-muted-k">Current lifetime cap balance (optional)</span>
                            <input
                                type="number"
                                value={currentBalance}
                                onChange={(e) => setCurrentBalance(e.target.value)}
                                data-testid="bc-balance"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k tabular-nums"
                                min="0"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm text-muted-k">Expected annual spend on contributions (optional)</span>
                            <input
                                type="number"
                                value={annualBurn}
                                onChange={(e) => setAnnualBurn(e.target.value)}
                                placeholder="e.g. 1500"
                                data-testid="bc-burn"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k tabular-nums"
                                min="0"
                            />
                        </label>
                    </div>

                    <label className="flex items-center gap-3 rounded-lg border border-kindred p-3">
                        <input
                            type="checkbox"
                            checked={isGrandfathered}
                            onChange={(e) => setIsGrandfathered(e.target.checked)}
                            data-testid="bc-grandfathered"
                            className="h-4 w-4 accent-[var(--kindred-primary)]"
                        />
                        <span className="text-sm text-primary-k">
                            Grandfathered (was on a Home Care Package before 1 Nov 2025)
                            <span className="block text-xs text-muted-k mt-0.5">
                                Lifetime cap is {isGrandfathered ? "$84,571.66" : "$135,318.69"}
                            </span>
                        </span>
                    </label>

                    <button
                        onClick={calc}
                        disabled={loading}
                        data-testid="bc-submit"
                        className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Calculating…" : "Calculate my budget"}
                    </button>
                </div>

                {result && (
                    <div className="mt-6 space-y-5 animate-fade-up" data-testid="bc-result">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Annual budget</div>
                                <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">{formatAUD(result.annual_total)}</div>
                                <div className="text-xs text-muted-k mt-1">Before 10% care management</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Quarterly draw</div>
                                <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">{formatAUD2(result.quarterly_total)}</div>
                                <div className="text-xs text-muted-k mt-1">After 10% care management</div>
                            </div>
                        </div>

                        <div className="bg-surface border border-kindred rounded-xl p-5">
                            <div className="overline">Per-stream quarterly allocation</div>
                            <div className="mt-3 space-y-2">
                                {result.streams.map((s) => (
                                    <div key={s.stream} className="flex items-baseline justify-between border-b border-kindred pb-2 last:border-0">
                                        <span className="text-sm text-primary-k">{s.stream}</span>
                                        <span className="font-heading text-lg text-primary-k tabular-nums">{formatAUD2(s.allocated)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="text-xs text-muted-k mt-3">Streams cannot cross-subsidise. Indicative split — your provider's care plan may differ.</div>
                        </div>

                        <div className="bg-surface border border-kindred rounded-xl p-5">
                            <div className="overline">Lifetime cap projection</div>
                            <div className="mt-3 flex items-baseline justify-between flex-wrap gap-3">
                                <div>
                                    <div className="font-heading text-2xl text-primary-k tabular-nums">{formatAUD2(result.lifetime_contributions)}</div>
                                    <div className="text-xs text-muted-k mt-1">of {formatAUD(result.lifetime_cap)}</div>
                                </div>
                                <div className="text-sm text-muted-k tabular-nums">{result.lifetime_pct.toFixed(1)}% used</div>
                            </div>
                            <div className="mt-3 h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                                <div className="bg-primary-k h-full" style={{ width: `${Math.min(100, result.lifetime_pct)}%` }} />
                            </div>
                            {result.years_to_cap != null && (
                                <p className="text-sm text-muted-k mt-3">
                                    At your current pace, you'd reach the lifetime cap in approximately <span className="font-medium text-primary-k tabular-nums">{result.years_to_cap.toFixed(1)} years</span>.
                                </p>
                            )}
                        </div>

                        <div className="bg-surface border border-kindred rounded-xl p-5">
                            <div className="overline">Rollover</div>
                            <p className="text-sm text-primary-k mt-2">
                                You can carry over up to <span className="font-medium tabular-nums">{formatAUD2(result.rollover_cap)}</span> to the next quarter — that's the higher of $1,000 or 10% of the quarterly budget. Funds above that are forfeited.
                            </p>
                        </div>

                        <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                            <div className="font-medium text-primary-k">Want this updating live?</div>
                            <p className="text-sm text-muted-k mt-1">Kindred tracks your real spend against this budget every day, alerts you to rollover risk, and watches your lifetime cap.</p>
                            <div className="mt-3 flex items-center gap-3 flex-wrap">
                                <Link to="/signup" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]">Start free trial</Link>
                                <Link to="/ai-tools/statement-decoder" className="text-sm text-primary-k underline inline-flex items-center gap-1">
                                    Decode a statement <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </section>
            <Footer />
        </div>
    );
}
