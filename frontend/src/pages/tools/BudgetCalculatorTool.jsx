import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import ReportIssueButton from "@/components/ReportIssueButton";
import ToolExplainer from "@/components/ToolExplainer";
import ToolHero from "@/components/ToolHero";
import { api, formatAUD, formatAUD2, extractErrorMessage } from "@/lib/api";
import { ToolSummary, NumberMono } from "@/components/ToolShell";
import { Loader2, ArrowRight, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ToolGate from "@/components/ToolGate";
import { ScreenshotBudget } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import { useParticipants } from "@/context/ParticipantsContext";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import ProfileInlinePrompts from "@/components/ProfileInlinePrompts";
import { loadProgramReference, getProgramReferenceSync } from "@/lib/programReference";
import {
    SUPPLEMENT_OPTIONS,
    ENTERAL_TYPE_OPTIONS,
    toWireSupplements,
    fromWireSupplements,
} from "@/lib/budgetSupplements";
import { OXYGEN_CERTIFICATION_COPY } from "@/content/supplements";

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

const SUPPLEMENT_HELP_TEXT =
    "Tick any supplement the participant's care plan covers. Wayly adds the seeded daily amount on top of the base annual budget. Grandfathered-only options are enabled when the Grandfathered checkbox above is ticked.";

export default function BudgetCalculatorTool() {
    const access = useToolAccess();
    const [classification, setClassification] = useState(4);
    const [isGrandfathered, setIsGrandfathered] = useState(false);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [annualBurn, setAnnualBurn] = useState("");
    // BUD-1 v1 F1: single source of truth for supplements, the calc, the
    // top card, and the participant profile all read/write the same array.
    // F2: `enteral` is ONE checkbox; the bolus / non-bolus radio disambiguates.
    const [applicableSupplements, setApplicableSupplements] = useState([]);
    const [enteralFeedingType, setEnteralFeedingType] = useState("bolus");
    // Participant name for personalised save button (F7 + name substitution)
    const [participantFirstName, setParticipantFirstName] = useState("");
    const { active: activeParticipant } = useParticipants();
    // Reflect the currently selected participant's first name whenever they
    // switch, so the personalised save-button copy stays in sync.
    useEffect(() => {
        if (activeParticipant?.first_name) {
            setParticipantFirstName(activeParticipant.first_name);
        }
    }, [activeParticipant?.id, activeParticipant?.first_name]);
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

    // BUD-1 v1 F3: block grandfathered-only options when Grandfathered = off.
    // Also auto-untick any that were selected before the flag flipped so the
    // request never includes an ignored value.
    useEffect(() => {
        if (isGrandfathered) return;
        setApplicableSupplements((prev) => {
            const grandfatheredOnly = new Set(
                SUPPLEMENT_OPTIONS.filter((o) => o.grandfatheredOnly).map((o) => o.value),
            );
            const next = prev.filter((v) => !grandfatheredOnly.has(v));
            return next.length === prev.length ? prev : next;
        });
    }, [isGrandfathered]);

    const toggleSupplement = (value) => {
        setApplicableSupplements((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
        );
    };

    // BUD-1 v1 F1: read Tier 3 supplements off the participant doc using the
    // shared adapter, so top card and bottom section stay in sync.
    const onParticipantUpdated = (doc) => {
        const { selected, enteralFeedingType: eType } = fromWireSupplements(
            doc?.applicable_supplements || [],
            doc?.enteral_feeding_type,
        );
        setApplicableSupplements(selected);
        if (eType) setEnteralFeedingType(eType);
        if (typeof doc?.is_grandfathered_hcp === "string" && doc.is_grandfathered_hcp === "yes") {
            setIsGrandfathered(true);
        }
        if (doc?.first_name) setParticipantFirstName(doc.first_name);
        // Re-run with the new supplements so the result panel reflects them
        if (result) {
            setTimeout(() => { calc(selected, eType); }, 50);
        }
    };

    const calc = async (overrideSupplements, overrideEnteralType) => {
        setLoading(true);
        try {
            const supps = overrideSupplements !== undefined ? overrideSupplements : applicableSupplements;
            const eType = overrideEnteralType !== undefined ? overrideEnteralType : enteralFeedingType;
            const wireSupps = toWireSupplements(supps, eType);
            const { data } = await api.post("/public/budget-calc", {
                classification,
                is_grandfathered: isGrandfathered,
                current_lifetime_balance: parseFloat(currentBalance) || 0,
                expected_annual_burn: parseFloat(annualBurn) || null,
                applicable_supplements: wireSupps.length ? wireSupps : null,
            });
            setResult(data);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Couldn't calculate the budget."));
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
                <ToolHero toolKey="budget-calculator" />
                <ToolGate toolName="Budget Calculator">
                    <ScreenshotBudget />
                </ToolGate>
                <section className="max-w-5xl mx-auto px-4 sm:px-8">
                    <ToolExplainer toolKey="budget-calculator" />
                </section>
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
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI Tools</Link>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Budget &amp; Lifetime Cap Calculator</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Enter your classification. We will show your annual budget, per-stream allocations, lifetime cap progress, and rollover risk, using the actual Support at Home rules (10% care management, $1,000 rollover floor).
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20">
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
                            <span className="text-sm text-muted-k">Expected annual out-of-pocket contribution (optional)</span>
                            <input
                                type="number"
                                value={annualBurn}
                                onChange={(e) => setAnnualBurn(e.target.value)}
                                placeholder="e.g. 1500"
                                data-testid="bc-burn"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k tabular-nums"
                                min="0"
                            />
                            <span className="text-xs text-muted-k mt-1 block">This does not change your funded budget. Wayly uses it to estimate how many years of contributions you can make before reaching the lifetime cap.</span>
                        </label>
                    </div>

                    <label className="flex items-start gap-3 rounded-lg border border-kindred p-3">
                        <input
                            type="checkbox"
                            checked={isGrandfathered}
                            onChange={(e) => setIsGrandfathered(e.target.checked)}
                            data-testid="bc-grandfathered"
                            className="h-4 w-4 mt-1 accent-[var(--kindred-primary)]"
                        />
                        <span className="text-sm text-primary-k">
                            Grandfathered (was on a Home Care Package before 1 Nov 2025)
                            <span className="block text-xs text-muted-k mt-1 leading-relaxed" data-testid="bc-grandfathered-help">
                                Grandfathered participants are covered by the Home Care Package no-worse-off arrangement. Lifetime cap is <span className="tabular-nums">{formatAUD2(result?.lifetime_cap_grandfathered ?? 86185.23)}</span> (lower than the standard Support at Home cap of <span className="tabular-nums">{formatAUD2(result?.lifetime_cap_standard ?? 137917.01)}</span>). Both caps are indexed on 20 March and 20 September each year.
                            </span>
                        </span>
                    </label>

                    <div data-testid="bc-supplements">
                        <span className="text-sm text-primary-k font-medium">Applicable supplements (optional)</span>
                        <p className="text-xs text-muted-k mt-1 leading-relaxed">
                            {SUPPLEMENT_HELP_TEXT}
                        </p>
                        <div className="mt-3 grid sm:grid-cols-2 gap-2">
                            {SUPPLEMENT_OPTIONS.map((opt) => {
                                const checked = applicableSupplements.includes(opt.value);
                                const disabled = opt.grandfatheredOnly && !isGrandfathered;
                                return (
                                    <label
                                        key={opt.value}
                                        data-testid={`bc-supplement-${opt.value}`}
                                        title={disabled ? "Available for grandfathered HCP participants only. Tick the Grandfathered checkbox above to enable." : undefined}
                                        className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${checked ? "border-primary-k bg-surface-2" : "border-kindred"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-surface-2"}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => !disabled && toggleSupplement(opt.value)}
                                            disabled={disabled}
                                            className="h-4 w-4 mt-0.5 accent-[var(--kindred-primary)]"
                                        />
                                        <span className="flex-1">
                                            <span className="text-sm text-primary-k font-medium block">{opt.label}</span>
                                            <span className="text-xs text-muted-k block mt-0.5">{opt.sub}</span>
                                            {opt.grandfatheredOnly && (
                                                <span
                                                    className="text-[10px] uppercase tracking-wider text-terracotta block mt-1"
                                                    data-testid={`bc-supplement-${opt.value}-gf-note`}
                                                >
                                                    Grandfathered HCP only
                                                </span>
                                            )}
                                            {/* OXY-1 v1 F2 · amber certification warning when the Oxygen
                                                supplement is ticked. Copy comes from the single-source
                                                content/supplements.js so future edits update all surfaces. */}
                                            {opt.value === "oxygen" && checked && (
                                                <div
                                                    className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs leading-relaxed text-primary-k"
                                                    data-testid="bc-oxygen-certification-warning"
                                                    role="note"
                                                >
                                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-700" aria-hidden="true" />
                                                    <span>
                                                        <span className="font-medium block">{OXYGEN_CERTIFICATION_COPY.short}</span>
                                                        <span className="block mt-1 text-muted-k">{OXYGEN_CERTIFICATION_COPY.actionHint}</span>
                                                    </span>
                                                </div>
                                            )}
                                            {/* BUD-1 v1 F2: enteral bolus vs non-bolus disambiguation. */}
                                            {opt.requiresEnteralType && checked && (
                                                <div className="mt-2 space-y-1" data-testid="bc-enteral-type">
                                                    {ENTERAL_TYPE_OPTIONS.map((t) => (
                                                        <label key={t.value} className="flex items-center gap-2 text-xs text-primary-k cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name="enteral-type"
                                                                value={t.value}
                                                                checked={enteralFeedingType === t.value}
                                                                onChange={() => setEnteralFeedingType(t.value)}
                                                                data-testid={`bc-enteral-${t.value}`}
                                                                className="accent-[var(--kindred-primary)]"
                                                            />
                                                            <span>{t.label} <span className="text-muted-k">({t.sub})</span></span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        onClick={() => calc()}
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
                        <ToolSummary
                            toolName="Budget Calculator"
                            headline={`Your quarterly usable budget is ${formatAUD2(result.quarterly_usable)}.`}
                            body={`Wayly worked out your Support at Home budget from your Classification and pension status. That's ${formatAUD(result.annual_total)} across the year, split into four quarters. The provider keeps ${formatAUD2(result.care_management_quarterly ?? ((result.quarterly_gross ?? result.annual_total/4) - result.quarterly_usable))} per quarter as their 10% care management fee. The rest is what you can spend on care.`}
                            tone="success"
                            testId="bc-summary"
                        />
                        <div className="grid sm:grid-cols-3 gap-4">
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-quarterly-gross">
                                <div className="overline">Gross quarterly</div>
                                <div className="mt-2 text-2xl text-primary-k"><NumberMono>{formatAUD2(result.quarterly_gross ?? (result.annual_total / 4))}</NumberMono></div>
                                <div className="text-xs text-muted-k mt-1">This is the figure printed on your statement (annual ÷ 4).</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-care-management">
                                <div className="overline">Care management (10%)</div>
                                <div className="mt-2 font-heading text-2xl text-primary-k tabular-nums">−{formatAUD2(result.care_management_quarterly ?? ((result.quarterly_gross ?? result.annual_total/4) - result.quarterly_usable))}</div>
                                <div className="text-xs text-muted-k mt-1">Provider's care management slice.</div>
                            </div>
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-quarterly-usable">
                                <div className="overline">Usable for services</div>
                                <div className="mt-2 text-2xl text-primary-k"><NumberMono>{formatAUD2(result.quarterly_usable)}</NumberMono></div>
                                <div className="text-xs text-muted-k mt-1">What you can spend on care this quarter.</div>
                            </div>
                        </div>
                        <div className="bg-surface border border-kindred rounded-xl p-4 flex items-baseline justify-between" data-testid="bc-annual-summary">
                            <span className="text-sm text-muted-k">Annual budget</span>
                            <NumberMono className="text-lg text-primary-k">{formatAUD(result.annual_total)}</NumberMono>
                        </div>

                        <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="bc-streams">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="overline">Per-stream quarterly allocation (indicative)</div>
                                {result.allocation_source === "statement" ? (
                                    <span data-testid="bc-streams-source" className="text-xs rounded-full bg-sage/10 text-sage px-2.5 py-1">From your latest statement</span>
                                ) : (
                                    <span data-testid="bc-streams-source" className="text-xs rounded-full bg-gold/25 text-[#6B4A0F] border border-gold/60 font-semibold px-2.5 py-1">Indicative split</span>
                                )}
                            </div>
                            {/* BUD-1 v1 F6: indicative caveat sits ABOVE the numbers, always visible. */}
                            <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-primary-k leading-relaxed" data-testid="bc-streams-indicative-note">
                                <span className="font-medium">Indicative split only.</span> Your participant's actual stream allocation is set in their individualised budget and care plan and may differ substantially. Streams cannot cross-subsidise. Check the quarterly budget summary on the provider statement for the real split.
                            </div>
                            <div className="mt-3 space-y-2">
                                {result.streams.map((s) => (
                                    <div key={s.stream} className="flex items-baseline justify-between border-b border-kindred pb-2 last:border-0">
                                        <span className="text-sm text-primary-k">{s.stream}</span>
                                        <NumberMono className="text-lg text-primary-k">{formatAUD2(s.allocated)}</NumberMono>
                                    </div>
                                ))}
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
                                                <NumberMono className="text-base text-primary-k">{formatAUD2(s.annual_aud)}/yr</NumberMono>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {result.annual_supplements_total > 0 && (
                                    <div className="mt-3 flex items-baseline justify-between bg-surface-2 rounded-lg px-3 py-2">
                                        <span className="text-sm text-muted-k">Annual budget + supplements</span>
                                        <NumberMono className="text-lg text-primary-k" data-testid="bc-supplements-total">
                                            {formatAUD(result.annual_total_with_supplements)}
                                        </NumberMono>
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
                                    <div className="text-2xl text-primary-k"><NumberMono>{formatAUD2(result.lifetime_contributions)}</NumberMono></div>
                                    <div className="text-xs text-muted-k mt-1">of {formatAUD(result.lifetime_cap)}</div>
                                </div>
                                <div className="text-sm text-muted-k tabular-nums">{result.lifetime_pct.toFixed(1)}% used</div>
                            </div>
                            <div className="mt-3 h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                                <div className="bg-primary-k h-full" style={{ width: `${Math.min(100, result.lifetime_pct)}%` }} />
                            </div>
                            <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                                <div data-testid="bc-lifetime-remaining" className="rounded-md bg-surface-2 border border-kindred px-3 py-2">
                                    <div className="text-muted-k">Remaining before cap</div>
                                    <NumberMono className="text-primary-k text-base">{formatAUD2(result.lifetime_remaining ?? Math.max(0, (result.lifetime_cap || 0) - (result.lifetime_contributions || 0)))}</NumberMono>
                                </div>
                                {result.expected_annual_contribution != null && (
                                    <div data-testid="bc-expected-contribution" className="rounded-md bg-surface-2 border border-kindred px-3 py-2">
                                        <div className="text-muted-k">Estimated annual contribution</div>
                                        <NumberMono className="text-primary-k text-base">{formatAUD2(result.expected_annual_contribution)}</NumberMono>
                                    </div>
                                )}
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
                                You can carry over up to <span className="font-medium tabular-nums">{formatAUD2(result.rollover_cap)}</span> to the next quarter, that's the higher of $1,000 or 10% of the quarterly budget. Funds above that are forfeited.
                            </p>
                        </div>

                        <ReportIssueButton variant="inline" toolName="Budget Calculator" toolOutput={result} />

                        {/* BUD-1 v1 F8: standard Wayly disclaimer at foot of results. */}
                        <AIAccuracyBanner />


                        {access !== "allowed" && (
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
                        )}
                    </div>
                )}
            </section>
            <section className="max-w-5xl mx-auto px-4 sm:px-8">
                <ToolExplainer toolKey="budget-calculator" />
            </section>
            <ToolRelatedLinks slug="budget-calculator" />
            <Footer />
        </div>
    );
}
