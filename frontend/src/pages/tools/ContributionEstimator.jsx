import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import ReportIssueButton from "@/components/ReportIssueButton";
import ToolExplainer from "@/components/ToolExplainer";
import ToolHero from "@/components/ToolHero";
import ToolGate from "@/components/ToolGate";
import { ScreenshotStatement } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import { useParticipants } from "@/context/ParticipantsContext";
import { useParticipantPrefill } from "@/hooks/useParticipantPrefill";
import { api, formatAUD2, formatAUD } from "@/lib/api";
import { usePersonaTier1 } from "@/lib/persona";
import { Loader2, Sparkles, ArrowRight, ChevronDown, ChevronUp, Info, Calendar, ShieldCheck, LifeBuoy, FileDown, TrendingUp } from "lucide-react";
import SeoHead, { softwareApplicationLd, howToLd, faqLd, breadcrumbLd } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
import {
    AutomatedDecisionDisclosure,
    DataFreshnessIndicator,
    ArtifactGeneration,
    isEnabled,
} from "@/uxf";

/* =========================================================================
   CE-2 v1.1, Contribution Estimator
   Workstreams C (input form), D (result sections 1-4), E (result 5-8).
   Backend: POST /api/ce2/calculate.
   ========================================================================= */

const _toolJsonLd = (cfg) => {
    const blocks = [softwareApplicationLd({
        name: cfg.toolName, description: cfg.toolDesc, url: `https://wayly.com.au${cfg.path}`,
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

const ASSESSMENT_OPTIONS = [
    { v: "have_classification", label: "I have my Support at Home classification" },
    { v: "awaiting_classification", label: "I've been assessed but don't have my classification yet" },
    { v: "not_assessed", label: "I have not been assessed yet" },
];

const ENTRY_PATHS = [
    { v: "not_assessed",              label: "I have not been assessed yet",                                    desc: "Range shown across Class 3, 5 and 8." },
    { v: "hcp_pre_sep_2024",          label: "I was on a Home Care Package on or before 12 September 2024",   desc: "No-worse-off principle applies." },
    { v: "npq_pre_sep_2024",          label: "I was on the National Priority Queue before 12 September 2024", desc: "No-worse-off principle applies." },
    { v: "hcp_post_sep_pre_nov_2025", label: "I started my Home Care Package between 13 Sep 2024 and 31 Oct 2025", desc: "Transitional Support at Home rates." },
    { v: "post_nov_2025",             label: "I started (or will start) Support at Home from 1 November 2025",    desc: "Standard arrangements apply." },
];

const PENSION_STATUS = [
    { v: "full_pension", label: "Full Age Pension" },
    { v: "part_pension", label: "Part Age Pension" },
    { v: "cshc",         label: "Self-funded with a Commonwealth Seniors Health Card" },
    { v: "self_funded",  label: "Self-funded, no CSHC" },
];

const CLASSIFICATION_OPTIONS = [
    ["class_1", "Class 1, lowest care needs"],
    ["class_2", "Class 2"],
    ["class_3", "Class 3"],
    ["class_4", "Class 4"],
    ["class_5", "Class 5"],
    ["class_6", "Class 6"],
    ["class_7", "Class 7"],
    ["class_8", "Class 8, highest care needs"],
    ["transitional_1", "Transitional HCP Level 1"],
    ["transitional_2", "Transitional HCP Level 2"],
    ["transitional_3", "Transitional HCP Level 3"],
    ["transitional_4", "Transitional HCP Level 4"],
    ["rcp", "Restorative Care Pathway"],
    ["eolp", "End of Life Pathway"],
];

const CE2_ENDPOINT = "/ce2/calculate";
const CE2_CONSTANTS_ENDPOINT = "/ce2/constants";
const CE2_PDF_ENDPOINT = "/ce2/pdf";
const _fmt = (n) => (n == null || Number.isNaN(n) ? "," : formatAUD2(n));


export default function ContributionEstimator() {
    const access = useToolAccess();
    const { active: activeParticipant } = useParticipants();
    const [form, setForm] = useState(() => defaultForm(activeParticipant));
    const [constants, setConstants] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cscBadge, setCscBadge] = useState(null); // { primary, date }

    // Sync person_name with active participant.
    useParticipantPrefill({
        value: form.person_name,
        onChange: (name) => setForm((f) => ({ ...f, person_name: name })),
    });

    useEffect(() => {
        api.get(CE2_CONSTANTS_ENDPOINT).then((r) => setConstants(r.data?.constants || null)).catch(() => {});
    }, []);

    // CSC-1 prefill hook (CE-2 v1.2). If the user recently completed a
    // Classification Self-Check, prefill their classification and show a
    // badge on the form. The user can still override.
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem("csc.run.latest.v1");
            if (!raw) return;
            const payload = JSON.parse(raw);
            const primary = payload?.classification?.primary;
            if (!primary || primary < 1 || primary > 8) return;
            const runAt = payload?.run_at ? new Date(payload.run_at) : null;
            // Only trust runs from the last 90 days
            if (runAt && (Date.now() - runAt.getTime()) > 90 * 24 * 3600 * 1000) return;
            setForm((f) => ({ ...f, assessment_status: "have_classification", classification: `class_${primary}` }));
            setCscBadge({ primary, date: runAt ? runAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null });
        } catch { /* ignore */ }
    }, []);

    const showFinancial = form.pension_status === "part_pension" || form.pension_status === "cshc";
    const showHcpFeeQuestion = form.entry_path === "hcp_pre_sep_2024";
    const showHcpLevel = form.entry_path === "hcp_pre_sep_2024" || form.entry_path === "hcp_post_sep_pre_nov_2025";
    const showClassificationPicker = form.assessment_status === "have_classification";

    const set = (patch) => { setForm((f) => ({ ...f, ...patch })); };

    const submit = async () => {
        setLoading(true); setError(null); setResult(null);
        try {
            const payload = buildPayload(form);
            const { data } = await api.post(CE2_ENDPOINT, payload);
            setResult(data);
            requestAnimationFrame(() => document.getElementById("ce-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        } catch (e) {
            setError(e?.response?.data?.detail || "Could not estimate contribution.");
        } finally { setLoading(false); }
    };

    if (access === "loading") return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolContribution} jsonLd={_toolJsonLd(SEO.toolContribution)} />
            <MarketingHeader />
            <div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div>
            <Footer />
        </div>
    );
    if (access === "blocked") return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolContribution} jsonLd={_toolJsonLd(SEO.toolContribution)} />
            <MarketingHeader />
            <ToolHero toolKey="contribution-estimator" />
            <ToolGate toolName="Contribution Estimator"><ScreenshotStatement /></ToolGate>
            <section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="contribution-estimator" /></section>
            <ToolRelatedLinks slug="contribution-estimator" />
            <Footer />
        </div>
    );

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolContribution} jsonLd={_toolJsonLd(SEO.toolContribution)} />
            <MarketingHeader />

            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI Tools</Link>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Contribution Estimator</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">
                    A plain-English estimate of what your household will pay each week under Support at Home. Wayly walks through your situation and shows how the government share and your share are worked out.
                </p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-6" data-testid="ce-form">
                <FormBody
                    form={form} set={set} constants={constants}
                    showFinancial={showFinancial}
                    showHcpFeeQuestion={showHcpFeeQuestion}
                    showHcpLevel={showHcpLevel}
                    showClassificationPicker={showClassificationPicker}
                    cscBadge={cscBadge}
                />
                <button
                    onClick={submit} disabled={loading} data-testid="ce-submit"
                    className="mt-4 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    See my estimate
                </button>
                {error && <div data-testid="ce-error" className="mt-3 text-sm text-terracotta">{typeof error === "string" ? error : JSON.stringify(error)}</div>}
            </section>

            {result && (
                <section id="ce-result" className="mx-auto max-w-3xl px-6 pb-16 space-y-5" data-testid="ce-result">
                    <ResultScreen result={result} form={form} constants={constants} onEdit={() => setResult(null)} access={access} />
                </section>
            )}

            <section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="contribution-estimator" /></section>
            <ToolRelatedLinks slug="contribution-estimator" />
            <AIAccuracyBanner disclaimer={TOOL_DISCLAIMERS?.contribution_estimator || TOOL_DISCLAIMERS?.default} className="max-w-5xl mx-auto px-4 sm:px-8 pb-16" />
            <Footer />
        </div>
    );
}


/* ---------- form helpers ---------- */

function defaultForm(activeParticipant) {
    const name = activeParticipant
        ? `${activeParticipant.first_name || ""} ${activeParticipant.last_name || ""}`.trim() || activeParticipant.name || ""
        : "";
    return {
        person_name: name,
        assessment_status: "have_classification",
        entry_path: "post_nov_2025",
        hcp_paid_fees: null,
        hcp_level_when_grandfathered: null,
        pension_status: "full_pension",
        relationship: "single",
        homeowner: true,
        income_excluding_pension: "",
        financial_assets: "",
        partner_income: "",
        partner_assets: "",
        classification: "class_5",
        mix_advanced: false,
        service_mix: { clinical: 30, independence: 45, everyday: 25 },
    };
}

function buildPayload(form) {
    const num = (v) => (v === "" || v == null ? null : Number(v));
    return {
        person_name: form.person_name || null,
        assessment_status: form.assessment_status,
        entry_path: form.entry_path,
        hcp_paid_fees: form.hcp_paid_fees,
        hcp_level_when_grandfathered: form.hcp_level_when_grandfathered,
        pension_status: form.pension_status,
        relationship: form.relationship,
        homeowner: !!form.homeowner,
        income_excluding_pension: num(form.income_excluding_pension),
        financial_assets: num(form.financial_assets),
        partner_income: form.relationship === "couple" ? num(form.partner_income) : null,
        partner_assets: form.relationship === "couple" ? num(form.partner_assets) : null,
        classification: form.assessment_status === "have_classification" ? form.classification : null,
        service_mix: form.service_mix,
        effective_date: new Date().toISOString().slice(0, 10),
    };
}


/* ---------- form body ---------- */

function FormBody({ form, set, constants, showFinancial, showHcpFeeQuestion, showHcpLevel, showClassificationPicker, cscBadge }) {
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-6">
            {/* Person name */}
            <FieldRow label="Person's name (optional)">
                <input
                    type="text" value={form.person_name} onChange={(e) => set({ person_name: e.target.value })}
                    placeholder="e.g. Louisa Davids" data-testid="ce-person-name"
                    className="w-full rounded-md border border-kindred px-3 py-2 focus:outline-none focus:ring-2 ring-primary-k"
                />
            </FieldRow>

            {/* Entry path (5 options, replaces the old grandfathered checkbox) */}
            <FieldRow label="Which best describes your situation?">
                <div className="space-y-2" data-testid="ce-entry-path">
                    {ENTRY_PATHS.map((p) => (
                        <RadioTile
                            key={p.v}
                            checked={form.entry_path === p.v}
                            onClick={() => set({
                                entry_path: p.v,
                                assessment_status: p.v === "not_assessed" ? "not_assessed" : form.assessment_status,
                                hcp_paid_fees: p.v === "hcp_pre_sep_2024" ? form.hcp_paid_fees : null,
                                hcp_level_when_grandfathered: (p.v === "hcp_pre_sep_2024" || p.v === "hcp_post_sep_pre_nov_2025") ? form.hcp_level_when_grandfathered : null,
                            })}
                            label={p.label} sub={p.desc}
                            testId={`ce-entry-${p.v}`}
                        />
                    ))}
                </div>
            </FieldRow>

            {/* HCP follow-up: did you pay fees? */}
            {showHcpFeeQuestion && (
                <FieldRow label="Did you pay any fees under your Home Care Package?" testId="ce-hcp-fee-followup">
                    <div className="flex gap-2 flex-wrap">
                        <PillButton active={form.hcp_paid_fees === false} onClick={() => set({ hcp_paid_fees: false })} testId="ce-hcp-fees-no">No, I never paid fees</PillButton>
                        <PillButton active={form.hcp_paid_fees === true} onClick={() => set({ hcp_paid_fees: true })} testId="ce-hcp-fees-yes">Yes, I paid the basic daily fee, income-tested fee, or both</PillButton>
                    </div>
                    {form.hcp_paid_fees === false && (
                        <div className="mt-3 rounded-lg bg-sage/10 border border-sage/25 p-3 text-sm text-primary-k" data-testid="ce-hcp-exempt-hint">
                            <div className="flex items-start gap-2">
                                <ShieldCheck className="h-4 w-4 mt-0.5 text-sage" />
                                <div>You will not pay any Support at Home contribution. The no-worse-off rule guarantees a permanent zero because you paid no HCP fees.</div>
                            </div>
                        </div>
                    )}
                </FieldRow>
            )}

            {showHcpLevel && (
                <FieldRow label="Which Home Care Package level were you on?">
                    <select
                        value={form.hcp_level_when_grandfathered || ""}
                        onChange={(e) => set({ hcp_level_when_grandfathered: e.target.value ? Number(e.target.value) : null })}
                        data-testid="ce-hcp-level"
                        className="w-full rounded-md border border-kindred px-3 py-2"
                    >
                        <option value="">Choose your level</option>
                        {[1,2,3,4].map((n) => <option key={n} value={n}>{`Level ${n}`}</option>)}
                    </select>
                </FieldRow>
            )}

            {/* Assessment status (only if entry path is not "not_assessed") */}
            {form.entry_path !== "not_assessed" && (
                <FieldRow label="Do you have a Support at Home classification?">
                    <div className="space-y-2" data-testid="ce-assessment-status">
                        {ASSESSMENT_OPTIONS.map((a) => (
                            <RadioTile
                                key={a.v}
                                checked={form.assessment_status === a.v}
                                onClick={() => set({ assessment_status: a.v })}
                                label={a.label}
                                testId={`ce-assessment-${a.v}`}
                            />
                        ))}
                    </div>
                </FieldRow>
            )}

            {/* Classification picker */}
            {showClassificationPicker && (
                <FieldRow label="Your classification">
                    {cscBadge && (
                        <div className="mb-2 text-xs text-primary-k bg-surface-2 border border-kindred rounded-lg px-3 py-2 inline-flex items-center gap-2" data-testid="ce-csc-badge">
                            <span className="inline-block h-2 w-2 rounded-full bg-[#6d907d]" />
                            Based on your CSC run{cscBadge.date ? ` from ${cscBadge.date}` : ""}. You can change it below.
                        </div>
                    )}
                    <select
                        value={form.classification} onChange={(e) => set({ classification: e.target.value })}
                        data-testid="ce-classification"
                        className="w-full rounded-md border border-kindred px-3 py-2"
                    >
                        {CLASSIFICATION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </FieldRow>
            )}

            {/* Pension status */}
            <FieldRow label="Age Pension status">
                <div className="grid sm:grid-cols-2 gap-2" data-testid="ce-pension-status">
                    {PENSION_STATUS.map((p) => (
                        <RadioTile
                            key={p.v}
                            checked={form.pension_status === p.v}
                            onClick={() => set({ pension_status: p.v })}
                            label={p.label}
                            testId={`ce-pension-${p.v}`}
                            compact
                        />
                    ))}
                </div>
            </FieldRow>

            {/* Household + homeownership */}
            <div className="grid sm:grid-cols-2 gap-3" data-testid="ce-household-block">
                <FieldRow label="Household">
                    <div className="flex gap-2">
                        <PillButton active={form.relationship === "single"} onClick={() => set({ relationship: "single" })} testId="ce-relationship-single">Single</PillButton>
                        <PillButton active={form.relationship === "couple"} onClick={() => set({ relationship: "couple" })} testId="ce-relationship-couple">Couple</PillButton>
                    </div>
                </FieldRow>
                <FieldRow label="Homeowner?">
                    <div className="flex gap-2">
                        <PillButton active={form.homeowner === true} onClick={() => set({ homeowner: true })} testId="ce-homeowner-yes">Yes</PillButton>
                        <PillButton active={form.homeowner === false} onClick={() => set({ homeowner: false })} testId="ce-homeowner-no">No</PillButton>
                    </div>
                </FieldRow>
            </div>

            {/* Progressive-disclosure financial section for Part Pension and CSHC */}
            {showFinancial && (
                <div className="rounded-xl border border-kindred bg-surface-2/60 p-4 space-y-3" data-testid="ce-financial-details">
                    <div>
                        <div className="text-sm font-medium text-primary-k">Financial details (optional)</div>
                        <p className="text-xs text-muted-k mt-1 leading-relaxed">
                            {"The exact means-tested rate depends on your assessable income and assets. Leave both blank if you'd rather see a range for now."}
                            {constants?.["means_test.income_free_area.individual"] && (
                                <> The current income-free area is <strong>${Math.round(constants["means_test.income_free_area.individual"].value).toLocaleString()}</strong> a year for a single person and the assets-free area for a homeowner is <strong>${Math.round(constants["means_test.assets_free_area.individual_homeowner"].value).toLocaleString()}</strong>.</>
                            )}
                        </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <FieldRow label="Your assessable income (excl. pension), $ per year">
                            <input
                                type="number" min="0" step="1" value={form.income_excluding_pension}
                                onChange={(e) => set({ income_excluding_pension: e.target.value })}
                                data-testid="ce-income" placeholder="e.g. 19029"
                                className="w-full rounded-md border border-kindred px-3 py-2 tabular-nums focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </FieldRow>
                        <FieldRow label="Assessable assets (not including the family home)">
                            <input
                                type="number" min="0" step="1" value={form.financial_assets}
                                onChange={(e) => set({ financial_assets: e.target.value })}
                                data-testid="ce-assets" placeholder="e.g. 10000"
                                className="w-full rounded-md border border-kindred px-3 py-2 tabular-nums focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </FieldRow>
                    </div>
                    {form.relationship === "couple" && (
                        <div className="grid sm:grid-cols-2 gap-3" data-testid="ce-partner-block">
                            <FieldRow label="Your partner's assessable income">
                                <input
                                    type="number" min="0" step="1" value={form.partner_income}
                                    onChange={(e) => set({ partner_income: e.target.value })}
                                    data-testid="ce-partner-income"
                                    className="w-full rounded-md border border-kindred px-3 py-2 tabular-nums"
                                />
                            </FieldRow>
                            <FieldRow label="Your partner's assessable assets">
                                <input
                                    type="number" min="0" step="1" value={form.partner_assets}
                                    onChange={(e) => set({ partner_assets: e.target.value })}
                                    data-testid="ce-partner-assets"
                                    className="w-full rounded-md border border-kindred px-3 py-2 tabular-nums"
                                />
                            </FieldRow>
                        </div>
                    )}
                </div>
            )}

            {/* Service mix advanced toggle */}
            <div>
                <button
                    type="button" onClick={() => set({ mix_advanced: !form.mix_advanced })}
                    data-testid="ce-mix-toggle"
                    className="text-sm text-muted-k inline-flex items-center gap-1 hover:text-primary-k"
                >
                    Service mix, defaults to 30 / 45 / 25 %
                    {form.mix_advanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {form.mix_advanced && (
                    <div className="mt-3 grid sm:grid-cols-3 gap-3" data-testid="ce-mix-inputs">
                        {["clinical", "independence", "everyday"].map((k) => (
                            <FieldRow key={k} label={`${k.charAt(0).toUpperCase() + k.slice(1)} %`}>
                                <input
                                    type="number" min="0" max="100" value={form.service_mix[k]}
                                    onChange={(e) => set({ service_mix: { ...form.service_mix, [k]: Number(e.target.value) || 0 } })}
                                    data-testid={`ce-mix-${k}`}
                                    className="w-full rounded-md border border-kindred px-3 py-2 tabular-nums"
                                />
                            </FieldRow>
                        ))}
                    </div>
                )}
                {form.mix_advanced && (
                    <div className="text-xs text-muted-k mt-1">Total: {form.service_mix.clinical + form.service_mix.independence + form.service_mix.everyday}%</div>
                )}
            </div>
        </div>
    );
}


const CE2_PERSONA_KEYS = [
    "ce2.results.hero_label",
    "ce2.results.hero",
    "ce2.results.government_share",
    "ce2.results.fee_exempt_hero",
    "ce2.results.fee_exempt_body",
];
const CE2_PERSONA_DEFAULTS = {
    "ce2.results.hero_label": "estimated weekly contribution",
    "ce2.results.hero": "This is what to expect to pay.",
    "ce2.results.government_share": "The government covers the rest, based on the income assessment.",
    "ce2.results.fee_exempt_hero": "No contribution will be payable.",
    "ce2.results.fee_exempt_body": (
        "Because of a Home Care Package before 12 September 2024 with no HCP fees, " +
        "the no-worse-off rule guarantees a permanent zero. No lifetime cap applies. " +
        "The rate will not change on reassessment."
    ),
};

/* ---------- result screen (8 sections) ---------- */

function ResultScreen({ result, form, constants, onEdit, access }) {
    const { copy: personaCopy } = usePersonaTier1(CE2_PERSONA_KEYS, CE2_PERSONA_DEFAULTS);
    return (
        <>
            {result.is_fee_exempt ? (
                <FeeExemptHeadline result={result} onEdit={onEdit} personaCopy={personaCopy} />
            ) : result.range_mode ? (
                <RangeHeadline result={result} onEdit={onEdit} personaCopy={personaCopy} />
            ) : (
                <PointHeadline result={result} onEdit={onEdit} personaCopy={personaCopy} />
            )}

            {/* Section 2: Government-share hero bar */}
            {!result.range_mode && !result.is_fee_exempt && <GovernmentShareBar result={result} personaCopy={personaCopy} />}

            {/* Section 3: Rate breakdown */}
            {!result.is_fee_exempt && <RateBreakdown result={result} form={form} />}

            {/* Section 4: Safety net */}
            {!result.is_fee_exempt && <SafetyNetPanel result={result} />}

            {/* Section 5: 1 October 2026 comparison */}
            {!result.range_mode && !result.is_fee_exempt && <OctoberComparison result={result} />}

            {/* Workstream L: HCP comparison. Rendered inline for entry paths 2 + 4,
                behind a toggle for 1 + 5, hidden entirely for path 3 (NPQ). */}
            <HcpComparisonPanel result={result} />

            {/* Section 6: What-if scenarios */}
            {!result.is_fee_exempt && <WhatIfPanel result={result} form={form} />}

            {/* Section 7: Also worth knowing */}
            <AlsoWorthKnowing result={result} />

            {/* Section 8: How this was calculated */}
            <HowThisWasCalculated result={result} form={form} constants={constants} />

            {/* UXF-1 v3 spec 3.22, data freshness indicator beside the DoH-sourced figures. */}
            {isEnabled("uxf_v3.provenance") && (
                <div className="pt-2 -mt-2">
                    <DataFreshnessIndicator
                        date="2025-09-20"
                        sourceUrl="https://www.health.gov.au/sites/default/files/2026-03/schedule-of-contributions-for-support-at-home-services.pdf"
                        sourceLabel="Department of Health, Schedule of Contributions for Support at Home"
                        testId="ce-freshness"
                    />
                </div>
            )}

            {/* UXF-1 v3 spec 3.23, automated decision disclosure. */}
            {isEnabled("uxf_v3.disclosure") && (
                <AutomatedDecisionDisclosure
                    contactUrl="/contact"
                    testId="ce-automated-decision"
                />
            )}

            {/* PDF download */}
            <PdfDownloadButton form={form} personName={result.person_name} />

            <ReportIssueButton variant="inline" toolName="Contribution Estimator" toolOutput={result} />

            {access !== "allowed" && (
                <div className="bg-surface-2 rounded-xl p-5 border border-kindred" data-testid="ce-signup-cta">
                    <div className="font-medium text-primary-k">Want this updated automatically as your statements arrive?</div>
                    <p className="text-sm text-muted-k mt-1">On a paid plan Wayly re-runs this estimate every time your care mix or income changes and shows you the delta.</p>
                    <Link to="/signup" className="mt-3 inline-flex items-center gap-1 text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#091D33]">
                        Start free trial <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            )}
        </>
    );
}


/* ---------- headlines ---------- */

function PointHeadline({ result, onEdit, personaCopy }) {
    // The "hero_label" tier1 already contains the possessive framing
    // (participant → "Your ...", caregiver → "{name}'s ..."). We treat
    // the returned string as the FULL label, so we drop the old prefix.
    const label = personaCopy?.["ce2.results.hero_label"] || "estimated weekly contribution";
    return (
        <div className="bg-primary-k text-white rounded-2xl p-8" data-testid="ce-result-headline">
            <div className="text-xs uppercase tracking-[0.18em] text-white/70" data-testid="ce-result-hero-label">{label}</div>
            <div className="mt-2 flex items-baseline gap-2">
                <span className="font-heading text-6xl tabular-nums" data-testid="ce-result-weekly">{_fmt(result.contribution_weekly)}</span>
                <span className="text-white/80 text-lg">/ week</span>
            </div>
            <div className="mt-2 text-sm text-white/80 tabular-nums" data-testid="ce-result-annual">
                {_fmt(result.contribution_annual)} a year · {_fmt(result.contribution_quarterly)} a quarter
            </div>
            <div className="mt-4 text-sm text-white/85" data-testid="ce-result-govt-share">
                {(personaCopy?.["ce2.results.government_share"] || CE2_PERSONA_DEFAULTS["ce2.results.government_share"]).replace(/\.$/, "")}: the Australian Government pays <span className="font-semibold" data-testid="ce-result-govt-annual">{_fmt(result.government_share_annual)}</span> a year, that is <span className="tabular-nums font-semibold">{result.government_share_percent?.toFixed(1)}%</span> of the total.
            </div>
            <button onClick={onEdit} className="mt-5 text-xs underline text-white/80 hover:text-white" data-testid="ce-edit-inputs">Edit my inputs</button>
        </div>
    );
}

function FeeExemptHeadline({ result, onEdit, personaCopy }) {
    void result;
    return (
        <div className="bg-sage text-white rounded-2xl p-8" data-testid="ce-fee-exempt-headline">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/85">
                <ShieldCheck className="h-4 w-4" /> Fee exempt
            </div>
            <h2 className="mt-2 font-heading text-4xl leading-tight" data-testid="ce-fee-exempt-hero">
                {personaCopy?.["ce2.results.fee_exempt_hero"] || CE2_PERSONA_DEFAULTS["ce2.results.fee_exempt_hero"]}
            </h2>
            <p className="mt-3 text-white/90 text-base leading-relaxed" data-testid="ce-fee-exempt-body">
                {personaCopy?.["ce2.results.fee_exempt_body"] || CE2_PERSONA_DEFAULTS["ce2.results.fee_exempt_body"]}
            </p>
            <button onClick={onEdit} className="mt-5 text-xs underline text-white/85 hover:text-white" data-testid="ce-edit-inputs">Edit my inputs</button>
        </div>
    );
}

function RangeHeadline({ result, onEdit, personaCopy }) {
    const label = personaCopy?.["ce2.results.hero_label"] || "estimated weekly contribution";
    return (
        <div className="bg-primary-k text-white rounded-2xl p-8" data-testid="ce-range-headline">
            <div className="text-xs uppercase tracking-[0.18em] text-white/70" data-testid="ce-result-hero-label">{label}</div>
            <div className="mt-2 flex items-baseline gap-3">
                <span className="font-heading text-5xl tabular-nums" data-testid="ce-range-min">{_fmt(result.range_min_weekly)}</span>
                <span className="text-white/70 text-2xl">to</span>
                <span className="font-heading text-5xl tabular-nums" data-testid="ce-range-max">{_fmt(result.range_max_weekly)}</span>
                <span className="text-white/80 text-lg">/ week</span>
            </div>
            <p className="mt-3 text-sm text-white/85 leading-relaxed">
                {result.range_anchors?.length > 0
                    ? `Because we don't yet know your final classification, the range spans Class 3, Class 5 and Class 8 outcomes.`
                    : `We showed a range because you haven't shared your financial details. Add them to see a single figure.`}
            </p>
            {result.range_anchors?.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm text-white/90" data-testid="ce-range-anchors">
                    {result.range_anchors.map((a) => (
                        <li key={a.classification} className="flex items-center justify-between border-b border-white/10 pb-1.5 last:border-0" data-testid={`ce-range-anchor-${a.classification}`}>
                            <span>{a.label}</span>
                            <span className="tabular-nums font-medium">{_fmt(a.weekly)} / wk</span>
                        </li>
                    ))}
                </ul>
            )}
            <button onClick={onEdit} className="mt-5 text-xs underline text-white/85 hover:text-white" data-testid="ce-edit-inputs">Edit my inputs</button>
        </div>
    );
}


/* ---------- section 2: government share hero bar ---------- */

function GovernmentShareBar({ result, personaCopy }) {
    void personaCopy; // reserved for future, gov-share phrasing already lives in PointHeadline
    const govtPct = Math.max(0, Math.min(100, result.government_share_percent || 0));
    const youPct = 100 - govtPct;
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="ce-govt-share-bar">
            <div className="text-xs uppercase tracking-wider text-muted-k">Who pays what</div>
            <div className="mt-3 h-12 w-full rounded-lg overflow-hidden flex" role="img"
                 aria-label={`Government pays ${govtPct.toFixed(1)}%, you pay ${youPct.toFixed(1)}%`}>
                <div style={{ width: `${govtPct}%` }} className="bg-sage flex items-center justify-center text-white text-sm font-semibold" data-testid="ce-govt-share-govt">
                    {govtPct >= 12 && <>Government · {govtPct.toFixed(1)}%</>}
                </div>
                <div style={{ width: `${youPct}%` }} className="bg-primary-k flex items-center justify-center text-white text-sm font-semibold" data-testid="ce-govt-share-you">
                    {youPct >= 8 && <>You · {youPct.toFixed(1)}%</>}
                </div>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs text-muted-k">
                <div><span className="inline-block h-2 w-2 rounded-full bg-sage mr-1" /> Government pays <span className="text-primary-k font-medium tabular-nums">{_fmt(result.government_share_annual)}</span> / year</div>
                <div><span className="inline-block h-2 w-2 rounded-full bg-primary-k mr-1" /> You pay <span className="text-primary-k font-medium tabular-nums">{_fmt(result.contribution_annual)}</span> / year</div>
            </div>
        </div>
    );
}


/* ---------- section 3: rate breakdown prose ---------- */

function RateBreakdown({ result, form }) {
    const bandInd = result.independence_rate?.toFixed(2);
    const bandEv = result.everyday_rate?.toFixed(2);
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-3" data-testid="ce-rate-breakdown">
            <div className="text-xs uppercase tracking-wider text-muted-k">Your rates by service type</div>
            <div className="grid grid-cols-3 gap-2">
                <RateCard label="Clinical care" rate={0} note="Always free for participants" testId="ce-rate-clinical" />
                <RateCard label="Independence" rate={bandInd} note="Personal care, meals" testId="ce-rate-independence" />
                <RateCard label="Everyday Living" rate={bandEv} note="Cleaning, transport, gardening" testId="ce-rate-everyday" />
            </div>
            <p className="text-sm text-primary-k leading-relaxed mt-2" data-testid="ce-rate-prose">
                {result.is_no_worse_off
                    ? "You are on the no-worse-off track, which caps your rates at 25% for both Independence and Everyday Living. Clinical care is always free."
                    : `Under standard arrangements, Independence services (personal care, meals) cost you ${bandInd}% and Everyday Living services (cleaning, transport) cost you ${bandEv}%. Clinical care is always fully funded by the government.`}
            </p>
        </div>
    );
}

function RateCard({ label, rate, note, testId }) {
    return (
        <div className="rounded-lg border border-kindred bg-surface-2 p-3" data-testid={testId}>
            <div className="text-xs uppercase tracking-wider text-muted-k">{label}</div>
            <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums">{rate === 0 ? "0%" : `${rate}%`}</div>
            <div className="text-xs text-muted-k mt-1 leading-tight">{note}</div>
        </div>
    );
}


/* ---------- section 4: safety net ---------- */

function SafetyNetPanel({ result }) {
    if (!result.applicable_lifetime_cap) return null;
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="ce-safety-net">
            <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 mt-0.5 text-sage" />
                <div>
                    <div className="text-primary-k font-medium">Your lifetime cap: {_fmt(result.applicable_lifetime_cap)}</div>
                    <p className="text-sm text-muted-k mt-1 leading-relaxed">
                        {"This is the total amount you'll ever pay for the Independence and Everyday Living components of Support at Home. Once you've contributed this much across your lifetime, you pay nothing further, regardless of how long you continue receiving services. Clinical care never counts towards this cap."}
                    </p>
                </div>
            </div>
        </div>
    );
}


/* ---------- section 5: October 2026 comparison ---------- */

function OctoberComparison({ result }) {
    if (result.contribution_post_october_2026_weekly == null) return null;
    const saving = (result.contribution_weekly || 0) - (result.contribution_post_october_2026_weekly || 0);
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="ce-oct-2026">
            <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 mt-0.5 text-primary-k" />
                <div className="flex-1">
                    <div className="text-primary-k font-medium">From 1 October 2026, personal care becomes fully government-funded</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-kindred p-3">
                            <div className="text-xs uppercase tracking-wider text-muted-k">Now</div>
                            <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums" data-testid="ce-oct-now">{_fmt(result.contribution_weekly)} / wk</div>
                        </div>
                        <div className="rounded-lg border border-sage/40 bg-sage/10 p-3">
                            <div className="text-xs uppercase tracking-wider text-sage">From 1 Oct 2026</div>
                            <div className="mt-1 font-heading text-2xl text-primary-k tabular-nums" data-testid="ce-oct-after">{_fmt(result.contribution_post_october_2026_weekly)} / wk</div>
                        </div>
                    </div>
                    {saving > 0.005 && (
                        <p className="mt-3 text-sm text-primary-k leading-relaxed" data-testid="ce-oct-saving">
                            {"That's about "}<strong className="tabular-nums">{_fmt(saving)}</strong>{" a week less, or "}<strong className="tabular-nums">{_fmt(saving * 52)}</strong>{" a year."}
                        </p>
                    )}
                    <p className="mt-2 text-xs text-muted-k leading-relaxed">
                        Personal care sits inside the Independence category. Wayly assumes personal care is about 40% of your Independence spend. If your care mix is different, your actual saving may vary.
                    </p>
                </div>
            </div>
        </div>
    );
}


/* ---------- section 6: what-if ---------- */

function WhatIfPanel({ result, form }) {
    // Simple three "what if" comparisons rendered client-side so caregivers
    // can eyeball the sensitivity. The engine has already computed the "as-is"
    // figure; this section flags the three levers that most caregivers ask about.
    const scenarios = useMemo(() => buildScenarios(result, form), [result, form]);
    if (!scenarios.length) return null;
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="ce-what-if">
            <div className="text-xs uppercase tracking-wider text-muted-k">What if…</div>
            <ul className="mt-3 space-y-3">
                {scenarios.map((s, i) => (
                    <li key={i} className="border-b border-kindred pb-3 last:border-0" data-testid={`ce-what-if-${i}`}>
                        <div className="text-primary-k text-sm">{s.headline}</div>
                        <div className="text-xs text-muted-k mt-0.5">{s.body}</div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function buildScenarios(result, form) {
    const out = [];
    if (result.contribution_weekly > 0 && form.pension_status !== "full_pension") {
        out.push({
            headline: "…you were on the Full Age Pension?",
            body: "You'd pay 5% on Independence and 17.5% on Everyday Living, which almost always works out to less than your current rates.",
        });
    }
    if (result.contribution_weekly > 5) {
        out.push({
            headline: "…you reduced your Everyday Living use?",
            body: `Everyday Living carries the highest participant rate (${result.everyday_rate?.toFixed(1)}%). Shifting some of your budget from cleaning or transport into Clinical care lowers your weekly contribution without cutting your total funding.`,
        });
    }
    if (result.applicable_lifetime_cap) {
        const yearsToCap = result.applicable_lifetime_cap / Math.max(1, result.contribution_annual || 1);
        if (isFinite(yearsToCap) && yearsToCap > 0) {
            out.push({
                headline: "…you kept paying at this rate for a long time?",
                body: `You'd hit your lifetime cap of ${formatAUD2(result.applicable_lifetime_cap)} in about ${yearsToCap.toFixed(1)} years, after which you pay nothing further for Independence and Everyday Living services.`,
            });
        }
    }
    return out.slice(0, 3);
}


/* ---------- section 7: also worth knowing ---------- */

function AlsoWorthKnowing({ result }) {
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="ce-also-worth-knowing">
            <div className="flex items-start gap-3">
                <LifeBuoy className="h-5 w-5 mt-0.5 text-clay" />
                <div>
                    <div className="text-primary-k font-medium">Also worth knowing</div>
                    <ul className="mt-2 space-y-2 text-sm text-primary-k">
                        <li className="leading-relaxed">
                            <strong>Financial hardship.</strong> If paying your contribution would cause you serious financial difficulty, you can apply to Services Australia for a hardship reduction.{" "}
                            <a href="https://www.servicesaustralia.gov.au/financial-hardship-for-people-getting-aged-care" target="_blank" rel="noopener noreferrer" className="text-primary-k underline" data-testid="ce-hardship-link">Read the criteria on Services Australia.</a>
                        </li>
                        <li className="leading-relaxed">
                            <strong>Reassessment.</strong>{" If your care needs change, your classification can be reassessed at any time. Wayly's Letters & Follow-ups tool can draft the request for you. "}
                            <Link to="/ai-tools/letters-and-follow-ups" className="text-primary-k underline">{"Open Letters & Follow-ups"}</Link>
                        </li>
                        {result.show_hcp_comparison === "always" && !result.hcp_comparison && (
                            <li className="leading-relaxed" data-testid="ce-hcp-comparison-hint">
                                <strong>{"Compared to your Home Care Package,"}</strong>{" Support at Home changes both how the government funds your care and what you pay."}
                            </li>
                        )}
                        <li className="leading-relaxed text-muted-k text-xs">
                            This is a plain-English estimate for your household planning. Your final rate is set by Services Australia based on your assessed income and assets.
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}


/* ---------- section 8: how this was calculated ---------- */

function HowThisWasCalculated({ result, form, constants }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="ce-how-calculated">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between text-left"
                data-testid="ce-how-calculated-toggle"
            >
                <div>
                    <div className="text-xs uppercase tracking-wider text-muted-k">Show working</div>
                    <div className="text-primary-k font-medium">How this was calculated</div>
                </div>
                {open ? <ChevronUp className="h-4 w-4 text-muted-k" /> : <ChevronDown className="h-4 w-4 text-muted-k" />}
            </button>
            {open && (
                <div className="mt-4 space-y-4 text-sm text-primary-k leading-relaxed">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-muted-k">Formula</div>
                        <ol className="mt-1 ml-5 list-decimal text-xs space-y-0.5">
                            <li>Income reduction = (your assessable income − income-free area) × 50%.</li>
                            <li>Asset reduction = (your assessable assets − assets-free area) × 7.8%.</li>
                            <li>Max reduction = (income limit − income-free area) × 50%.</li>
                            <li>Input rate = max(income, asset reduction) ÷ max reduction × 100.</li>
                            <li>Independence rate = input rate × 0.45 + 5%.</li>
                            <li>Everyday rate = input rate × 0.625 + 17.5%.</li>
                        </ol>
                    </div>

                    {result.source_citations?.length > 0 && (
                        <div>
                            <div className="text-xs uppercase tracking-wider text-muted-k">Constants used</div>
                            <ul className="mt-1 space-y-1">
                                {result.source_citations.map((c) => (
                                    <li key={c.key} className="text-xs" data-testid={`ce-citation-${c.key}`}>
                                        <span className="text-primary-k">{c.label}: </span>
                                        <span className="tabular-nums font-medium">{c.value}</span>
                                        {c.source_url && (
                                            <>
                                                {" · "}
                                                <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-muted-k hover:text-primary-k underline">source</a>
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="text-xs text-muted-k italic leading-relaxed">
                        {"Personal care is assumed to be 40% of your Independence spend, other Independence services the remaining 60%. This is Wayly's estimate, not a published Department of Health figure. From 1 October 2026 personal care becomes fully government-funded under the Aged Care Act 2024, which is why your weekly figure drops."}
                    </div>
                </div>
            )}
        </div>
    );
}


/* ---------- workstream L: HCP comparison ---------- */

function HcpComparisonPanel({ result }) {
    const mode = result.show_hcp_comparison;
    const [open, setOpen] = useState(mode === "always");
    if (mode === "never" || !result.hcp_comparison) return null;
    const hcp = result.hcp_comparison;
    const delta = hcp.delta_weekly || 0;
    const sahCheaper = hcp.is_sah_cheaper;
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="ce-hcp-comparison">
            <button
                type="button"
                onClick={() => mode === "toggle" && setOpen((o) => !o)}
                className={`w-full flex items-start justify-between gap-3 text-left ${mode === "toggle" ? "cursor-pointer" : ""}`}
                data-testid="ce-hcp-comparison-toggle"
            >
                <div className="flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 mt-0.5 text-clay flex-shrink-0" />
                    <div>
                        <div className="text-xs uppercase tracking-wider text-muted-k">Compared to your Home Care Package</div>
                        <div className="text-primary-k font-medium mt-0.5">Level {hcp.hcp_level} · September 2025 fees</div>
                    </div>
                </div>
                {mode === "toggle" && (open ? <ChevronUp className="h-4 w-4 text-muted-k" /> : <ChevronDown className="h-4 w-4 text-muted-k" />)}
            </button>
            {open && (
                <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        <HcpCell label="HCP would-be" weekly={hcp.hcp_weekly} annual={hcp.hcp_annual} testId="ce-hcp-would-be" />
                        <HcpCell label="Support at Home" weekly={hcp.sah_weekly} annual={hcp.sah_annual} testId="ce-hcp-sah" highlight />
                        <HcpCell
                            label={sahCheaper ? "Saving under SAH" : "More under SAH"}
                            weekly={Math.abs(delta)}
                            annual={Math.abs(hcp.delta_annual || 0)}
                            testId="ce-hcp-delta"
                            tone={sahCheaper ? "sage" : "clay"}
                        />
                    </div>
                    <p className="text-xs text-muted-k leading-relaxed">
                        {"HCP figures use the last-indexation (September 2025) fees for a Level "}{hcp.hcp_level}{" package: Basic Daily Fee "}
                        <strong className="tabular-nums">{_fmt(hcp.basic_daily_fee_daily)}</strong>{" per day plus Income-Tested Care Fee "}
                        <strong className="tabular-nums">{_fmt(hcp.itcf_daily)}</strong>{" per day. Support at Home replaced HCP on 1 November 2025."}
                    </p>
                </div>
            )}
        </div>
    );
}

function HcpCell({ label, weekly, annual, testId, highlight = false, tone }) {
    const bg = tone === "sage" ? "bg-sage/10 border-sage/40" : tone === "clay" ? "bg-clay/10 border-clay/40" : highlight ? "bg-primary-k/5 border-primary-k/25" : "bg-surface-2 border-kindred";
    const labelColor = tone === "sage" ? "text-sage" : tone === "clay" ? "text-clay" : "text-muted-k";
    return (
        <div className={`rounded-lg border p-3 ${bg}`} data-testid={testId}>
            <div className={`text-xs uppercase tracking-wider ${labelColor}`}>{label}</div>
            <div className="mt-1 font-heading text-xl text-primary-k tabular-nums">{_fmt(weekly)}</div>
            <div className="text-xs text-muted-k tabular-nums">{_fmt(annual)} / yr</div>
        </div>
    );
}


/* ---------- workstream I: PDF download ---------- */

function PdfDownloadButton({ form, personName }) {
    const [phase, setPhase] = useState("idle");
    const [error, setError] = useState(null);
    const [currentStep, setCurrentStep] = useState(0);
    const useUxfArtifact = isEnabled("uxf_v3.artifacts");

    const download = async () => {
        setPhase("generating"); setError(null); setCurrentStep(0);
        try {
            const payload = buildPayload(form);
            // Announce phase progression so ArtifactGeneration reflects
            // what's actually happening on the wire.
            const bump = setInterval(() => setCurrentStep((s) => Math.min(s + 1, 1)), 400);
            const res = await api.post(CE2_PDF_ENDPOINT, payload, { responseType: "blob" });
            clearInterval(bump);
            const blob = new Blob([res.data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safe = (personName || form?.person_name || "wayly").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
            a.download = `${safe || "wayly"}_contribution_estimate.pdf`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            setCurrentStep(1);
            setPhase("ready");
        } catch (e) {
            setError("Could not download the PDF. Try again in a moment.");
            setPhase("failed");
        }
    };
    // Legacy button (behind uxf_v3.artifacts flag), kept unchanged when the flag is off.
    if (!useUxfArtifact) {
        return (
            <div className="bg-surface border border-kindred rounded-2xl p-5 flex items-center justify-between gap-3 flex-wrap" data-testid="ce-pdf-block">
                <div>
                    <div className="text-primary-k font-medium">Take this with you</div>
                    <div className="text-xs text-muted-k mt-0.5">A one-page PDF you can share with your case manager or a financial adviser.</div>
                    {error && <div className="mt-2 text-xs text-terracotta" data-testid="ce-pdf-error">{error}</div>}
                </div>
                <button
                    type="button"
                    onClick={download}
                    disabled={phase === "generating"}
                    data-testid="ce-pdf-download"
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60"
                >
                    {phase === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    {phase === "generating" ? "Preparing PDF…" : "Download PDF"}
                </button>
            </div>
        );
    }
    // UXF-1 v3 ArtifactGeneration wrapping.
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5 space-y-3" data-testid="ce-pdf-block">
            <div>
                <div className="text-primary-k font-medium">Take this with you</div>
                <div className="text-xs text-muted-k mt-0.5">A one-page PDF you can share with your case manager or a financial adviser.</div>
            </div>
            {phase === "idle" ? (
                <button
                    type="button"
                    onClick={download}
                    data-testid="ce-pdf-download"
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-[#091D33]"
                >
                    <FileDown className="h-4 w-4" />
                    Download PDF
                </button>
            ) : (
                <ArtifactGeneration
                    family="ce2"
                    phase={phase}
                    currentStep={currentStep}
                    onDownload={() => { setPhase("idle"); download(); }}
                    error={error}
                    onRetry={download}
                    testId="ce-pdf-artifact"
                />
            )}
        </div>
    );
}


/* ---------- primitives ---------- */

function FieldRow({ label, children, testId }) {
    return (
        <label className="block" data-testid={testId}>
            <span className="text-sm text-primary-k font-medium">{label}</span>
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

function RadioTile({ checked, onClick, label, sub, testId, compact = false }) {
    return (
        <button
            type="button" onClick={onClick} data-testid={testId}
            aria-checked={checked} role="radio"
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
                checked ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"
            }`}
        >
            <div className={`flex items-start gap-2 ${compact ? "" : ""}`}>
                <span className={`mt-1 h-3 w-3 rounded-full border flex-shrink-0 ${checked ? "bg-primary-k border-primary-k" : "border-muted-k"}`} />
                <span>
                    <span className="text-primary-k text-sm font-medium block">{label}</span>
                    {sub && <span className="text-xs text-muted-k block mt-0.5">{sub}</span>}
                </span>
            </div>
        </button>
    );
}

function PillButton({ active, onClick, children, testId }) {
    return (
        <button
            type="button" onClick={onClick} data-testid={testId}
            className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                active ? "bg-primary-k text-white border-primary-k" : "border-kindred text-primary-k hover:border-primary-k"
            }`}
        >
            {children}
        </button>
    );
}
