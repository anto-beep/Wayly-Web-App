import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import { api, formatAUD, formatAUD2 } from "@/lib/api";
import { Loader2, ArrowRight, Sparkles } from "lucide-react";
import ToolGate from "@/components/ToolGate";
import { ScreenshotBudget } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import ProfileInlinePrompts from "@/components/ProfileInlinePrompts";
import { loadProgramReference, getProgramReferenceSync } from "@/lib/programReference";

import SeoHead, { softwareApplicationLd, howToLd, faqLd, breadcrumbLd } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

const _toolJsonLd = (cfg) => {
    const blocks = [softwareApplicationLd({
        name: cfg.toolName,
        description: cfg.toolDesc,
        url: `https://wayly.com.au${cfg.path}`,
    })];
    if (cfg.howTo) blocks.push(howToLd(cfg.howTo));
    if (cfg.faqs) blocks.push(faqLd(cfg.faqs));
    blocks.push(breadcrumbLd([
        { name: "Home", url: "/" },
        { name: "AI Tools", url: "/ai-tools" },
        { name: cfg.toolName, url: cfg.path },
    ]));
    return blocks;
};

const CLASSIFICATIONS_FALLBACK = [
    { v: 1, annual: 10731 },
    { v: 2, annual: 16034 },
    { v: 3, annual: 21966 },
    { v: 4, annual: 29696 },
    { v: 5, annual: 39697 },
    { v: 6, annual: 48114 },
    { v: 7, annual: 58148 },
    { v: 8, annual: 78106 },
];

const SUPPLEMENT_OPTIONS = [
    { value: "oxygen", label: "Oxygen supplement", sub: "$14.66/day · medical certification required" },
    { value: "enteral_bolus", label: "Enteral feeding (bolus)", sub: "$23.25/day" },
    { value: "enteral_non_bolus", label: "Enteral feeding (non-bolus)", sub: "$26.11/day" },
    { value: "veterans", label: "Veterans' supplement", sub: "11.5% of base individual daily" },
    { value: "dementia_cognition", label: "Dementia & cognition (grandfathered HCP)", sub: "11.5% · grandfathered HCP only" },
    { value: "eachd_top_up", label: "EACHD top-up (grandfathered)", sub: "$3.45/day · grandfathered since 2013" },
];

export default function BudgetCalculatorTool() {
    const access = useToolAccess();
    const [classification, setClassification] = useState(4);
    const [isGrandfathered, setIsGrandfathered] = useState(false);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [annualBurn, setAnnualBurn] = useState("");
    const [applicableSupplements, setApplicableSupplements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [, _setSnapshotVersion] = useState(0);

    // Pull the live figures from /api/program-reference/public on mount.
    useEffect(() => { loadProgramReference().then(() => _setSnapshotVersion((v) => v + 1)); }, []);

    const CLASSIFICATIONS = useMemo(() => {
        const snap = getProgramReferenceSync();
        const list = [];
        for (let v = 1; v <= 8; v++) {
            const row = snap.classifications?.[String(v)];
            list.push({ v, annual: row ? row.annual : CLASSIFICATIONS_FALLBACK[v - 1].annual });
        }
        return list;
    }, []);

    const toggleSupplement = (value) => {
        setApplicableSupplements((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
        );
    };

    // Map a participant doc's Tier 3 supplements onto the calc's value set
    const _participantSupplementsToCalc = (doc) => {
        const out = [];
        const supp = doc?.applicable_supplements || [];
        const enteralType = doc?.enteral_feeding_type;
        supp.forEach((s) => {
            if (s === "enteral") {
                out.push(enteralType === "non_bolus" ? "enteral_non_bolus" : "enteral_bolus");
            } else if (s === "oxygen" || s === "veterans" || s === "dementia_cognition" || s === "eachd_top_up") {
                out.push(s);
            }
        });
        return out;
    };

    // Called when the inline prompt saves Tier 3 supplements — re-run the
    // calc immediately so the caregiver sees the updated annual total.
    const onParticipantUpdated = (doc) => {
        const next = _participantSupplementsToCalc(doc);
        setApplicableSupplements(next);
        if (typeof doc?.is_grandfathered_hcp === "string" && doc.is_grandfathered_hcp === "yes") {
            setIsGrandfathered(true);
        }
        // Re-run with the new supplements so the result panel reflects them
        if (result) {
            setTimeout(() => { calc(next); }, 50);
        }
    };

    const calc = async (overrideSupplements) => {
        setLoading(true);
        try {
            const supps = overrideSupplements !== undefined ? overrideSupplements : applicableSupplements;
            const { data } = await api.post("/public/budget-calc", {
                classification,
                is_grandfathered: isGrandfathered,
                current_lifetime_balance: parseFloat(currentBalance) || 0,
                expected_annual_burn: parseFloat(annualBurn) || null,
                applicable_supplements: supps.length ? supps : null,
            });
            setResult(data);
        } finally {
            setLoading(false);
        }
    };

    if (access === "loading") {
        return (
            <div className="min-h-screen bg-kindred">
                <SeoHead {...SEO.toolBudgetCalculator} jsonLd={_toolJsonLd(SEO.toolBudgetCalculator)} />
            <MarketingHeader />
                <div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div>
                <ToolRelatedLinks slug="budget-calculator" />
            <Footer />
            </div>
        );
    }
    if (access === "blocked") {
        return (
            <div className="min-h-screen bg-kindred">
                <SeoHead {...SEO.toolBudgetCalculator} jsonLd={_toolJsonLd(SEO.toolBudgetCalculator)} />
                <MarketingHeader />
                <section className="mx-auto max-w-4xl px-6 pt-8">
                    <AIAccuracyBanner text={TOOL_DISCLAIMERS["budget-calculator"]} />
                </section>
                <ToolGate toolName="Budget Calculator">
                    <ScreenshotBudget />
                </ToolGate>
                <ToolRelatedLinks slug="budget-calculator" />
            <Footer />
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolBudgetCalculator} jsonLd={_toolJsonLd(SEO.toolBudgetCalculator)} />
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
                <ProfileInlinePrompts where="budget_calculator" onParticipantUpdated={onParticipantUpdated} />
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-5 mt-4" data-testid="budget-calculator">
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

                    <div data-testid="bc-supplements">
                        <span className="text-sm text-primary-k font-medium">Applicable supplements (optional)</span>
                        <p className="text-xs text-muted-k mt-1 leading-relaxed">
                            Tick any supplement the participant's care plan covers. Wayly adds the seeded daily amount on top of the base annual budget and filters out supplements that don't apply (e.g. grandfathered-only when no HCP transition).
                        </p>
                        <div className="mt-3 grid sm:grid-cols-2 gap-2">
                            {SUPPLEMENT_OPTIONS.map((opt) => {
                                const checked = applicableSupplements.includes(opt.value);
                                return (
                                    <label
                                        key={opt.value}
                                        data-testid={`bc-supplement-${opt.value}`}
                                        className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleSupplement(opt.value)}
                                            className="h-4 w-4 mt-0.5 accent-[var(--kindred-primary)]"
                                        />
                                        <span>
                                            <span className="text-sm text-primary-k font-medium block">{opt.label}</span>
                                            <span className="text-xs text-muted-k block mt-0.5">{opt.sub}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        onClick={calc}
                        disabled={loading}
                        data-testid="bc-submit"
                        className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Calculating…" : "Calculate my budget"}
                    </button>
                </div>

                {result && (
                    <div className="mt-6 space-y-5 animate-fade-up" data-testid="bc-result">
                        <div className="grid sm:grid-cols-3 gap-4">
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-quarterly-gross">
                                <div className="overline">Gross quarterly</div>
                                <div className="mt-2 font-heading text-2xl text-primary-k tabular-nums">{formatAUD2(result.quarterly_gross ?? (result.annual_total / 4))}</div>
                                <div className="text-xs text-muted-k mt-1">This is the figure printed on your statement (annual ÷ 4).</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-care-management">
                                <div className="overline">Care management (10%)</div>
                                <div className="mt-2 font-heading text-2xl text-primary-k tabular-nums">−{formatAUD2(result.care_management_quarterly ?? ((result.quarterly_gross ?? result.annual_total/4) - result.quarterly_usable))}</div>
                                <div className="text-xs text-muted-k mt-1">Provider's care management slice.</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-quarterly-usable">
                                <div className="overline">Usable for services</div>
                                <div className="mt-2 font-heading text-2xl text-primary-k tabular-nums">{formatAUD2(result.quarterly_usable)}</div>
                                <div className="text-xs text-muted-k mt-1">What you can spend on care this quarter.</div>
                            </div>
                        </div>
                        <div className="bg-surface border border-kindred rounded-xl p-4 flex items-baseline justify-between" data-testid="bc-annual-summary">
                            <span className="text-sm text-muted-k">Annual budget</span>
                            <span className="font-heading text-lg text-primary-k tabular-nums">{formatAUD(result.annual_total)}</span>
                        </div>

                        <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-streams">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="overline">Per-stream quarterly allocation</div>
                                {result.allocation_source === "statement" ? (
                                    <span data-testid="bc-streams-source" className="text-xs rounded-full bg-sage/10 text-sage px-2.5 py-1">From your latest statement</span>
                                ) : (
                                    <span data-testid="bc-streams-source" className="text-xs rounded-full bg-amber-100 text-primary-k px-2.5 py-1">Indicative split</span>
                                )}
                            </div>
                            <div className="mt-3 space-y-2">
                                {result.streams.map((s) => (
                                    <div key={s.stream} className="flex items-baseline justify-between border-b border-kindred pb-2 last:border-0">
                                        <span className="text-sm text-primary-k">{s.stream}</span>
                                        <span className="font-heading text-lg text-primary-k tabular-nums">{formatAUD2(s.allocated)}</span>
                                    </div>
                                ))}
                            </div>
                            <div data-testid="bc-streams-note" className="text-xs text-muted-k mt-3 leading-relaxed">
                                {result.streams_note || "Streams cannot cross-subsidise. Indicative split — your provider's care plan may differ."}
                            </div>
                        </div>
                        {(result.applied_supplements?.length > 0 || result.supplement_warnings?.length > 0) && (
                            <div data-testid="bc-supplements-result" className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Supplements</div>
                                {result.applied_supplements?.length > 0 && (
                                    <ul className="mt-3 space-y-2">
                                        {result.applied_supplements.map((s) => (
                                            <li key={s.name} className="flex items-baseline justify-between border-b border-kindred pb-2 last:border-0">
                                                <span className="text-sm text-primary-k">{s.name.replace(/_/g, " ")}</span>
                                                <span className="font-heading text-base text-primary-k tabular-nums">{formatAUD2(s.annual_aud)}/yr</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {result.annual_supplements_total > 0 && (
                                    <div className="mt-3 flex items-baseline justify-between bg-surface-2 rounded-lg px-3 py-2">
                                        <span className="text-sm text-muted-k">Annual budget + supplements</span>
                                        <span className="font-heading text-lg text-primary-k tabular-nums" data-testid="bc-supplements-total">
                                            {formatAUD(result.annual_total_with_supplements)}
                                        </span>
                                    </div>
                                )}
                                {result.supplement_warnings?.length > 0 && (
                                    <ul className="mt-3 space-y-1 text-xs text-terracotta" data-testid="bc-supplement-warnings">
                                        {result.supplement_warnings.map((w, i) => <li key={i}>• {w}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}

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
                            <p className="text-sm text-muted-k mt-1">Wayly tracks your real spend against this budget every day, alerts you to rollover risk, and watches your lifetime cap.</p>
                            <div className="mt-3 flex items-center gap-3 flex-wrap">
                                <Link to="/signup" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#091D33]">Start free trial</Link>
                                <Link to="/ai-tools/statement-decoder" className="text-sm text-primary-k underline inline-flex items-center gap-1">
                                    Decode a statement <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </section>
            <ToolRelatedLinks slug="budget-calculator" />
            <Footer />
        </div>
    );
}
