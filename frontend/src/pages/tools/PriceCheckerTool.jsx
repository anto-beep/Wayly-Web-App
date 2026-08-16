import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AboutBackLink from "@/components/AboutBackLink";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import ReportIssueButton from "@/components/ReportIssueButton";
import { NumberMono } from "@/components/ToolShell";
import ToolExplainer from "@/components/ToolExplainer";
import ToolHero from "@/components/ToolHero";
import ToolGate from "@/components/ToolGate";
import { ScreenshotStatement } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import { useAuth } from "@/context/AuthContext";
import { api, formatAUD2, extractErrorMessage } from "@/lib/api";
import { track } from "@/lib/analytics";
import {
    AutomatedDecisionDisclosure,
    DataFreshnessIndicator,
    isEnabled,
} from "@/uxf";
import ADMDisclosure, { ADMDisclosureTrigger } from "@/components/adm/ADMDisclosure";
import DecoderContextPanel from "@/components/pc/DecoderContextPanel";
import SaveCheckButton from "@/components/pc/SaveCheckButton";
import PdfExportButton from "@/components/pc/PdfExportButton";
import EmailProviderModal from "@/components/pc/EmailProviderModal";
import SnapshotSelector from "@/components/pc/SnapshotSelector";
import {
    Loader2, Sparkles, ArrowRight, FileText, AlertTriangle, Info, ExternalLink,
    HelpCircle, ChevronDown, CheckCircle2, Mail,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

const UNIT_LABEL = { hour: "$ per hour", trip: "$ per trip", meal: "$ per meal", month: "$ per month", kilometre: "$ per kilometre" };
const UNIT_WORD = { hour: "per hour", trip: "per trip", meal: "per meal", month: "per month", kilometre: "per kilometre" };

const STREAM_TONE = {
    "Clinical":         { bg: "bg-primary-k/10", text: "text-primary-k", border: "border-primary-k/25" },
    "Independence":     { bg: "bg-sage/15", text: "text-sage", border: "border-sage/25" },
    "Everyday Living":  { bg: "bg-gold/20", text: "text-gold-700", border: "border-gold-700/25" },
};

const POSITION_TONE = {
    above:   { text: "text-terracotta", chip: "bg-terracotta/10 text-terracotta border-terracotta/25", icon: AlertTriangle },
    below:   { text: "text-primary-k", chip: "bg-primary-k/10 text-primary-k border-primary-k/25", icon: Info },
    in:      { text: "text-sage", chip: "bg-sage/10 text-sage border-sage/25", icon: CheckCircle2 },
    not_checkable: { text: "text-muted-k", chip: "bg-surface-2 text-muted-k border-kindred", icon: Info },
    unavailable:   { text: "text-muted-k", chip: "bg-surface-2 text-muted-k border-kindred", icon: Info },
};

export default function PriceCheckerTool() {
    const access = useToolAccess();
    const { user } = useAuth();

    // ---- Service dictionary (WS1) ----
    const [servicesData, setServicesData] = useState({ services: [], snapshot_id: null });
    const [snapshotList, setSnapshotList] = useState([]);
    const [selectedSnapshot, setSelectedSnapshot] = useState(null);

    // ---- Form state ----
    const [service, setService] = useState("Personal care");
    const [transportUnit, setTransportUnit] = useState("trip"); // WS5 guard 6
    const [rate, setRate] = useState("");
    const [provider, setProvider] = useState("");
    const [isGrandfathered, setIsGrandfathered] = useState(false);
    const [afterHoursToggle, setAfterHoursToggle] = useState(false);
    const [continueAnyway, setContinueAnyway] = useState(false);

    // ---- CE read-through (§3.3) ----
    const [ceState, setCeState] = useState(null); // { pension_status, is_grandfathered, classification, created_at }
    const [inlinePension, setInlinePension] = useState("");

    // ---- Result ----
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // ---- ADM disclosure modal (§WS14) ----
    const [admOpen, setAdmOpen] = useState(false);

    // ---- Data loaders ----
    useEffect(() => {
        if (access === "loading") return;
        try { track.ppc.toolOpened({}); } catch (_) { /* noop */ }
        api.get("/ppc/snapshots").then((r) => {
            setSnapshotList(r.data?.snapshots || []);
            setSelectedSnapshot(r.data?.default_snapshot_id || null);
            try { track.ppc.snapshotSelectorShown({ available_snapshot_count: (r.data?.snapshots || []).length }); } catch (_) { /* noop */ }
        }).catch(() => { /* soft-fail */ });
    }, [access]);

    useEffect(() => {
        api.get("/ppc/services", { params: selectedSnapshot ? { snapshot_id: selectedSnapshot } : {} })
            .then((r) => setServicesData(r.data))
            .catch(() => setServicesData({ services: [], snapshot_id: null }));
    }, [selectedSnapshot]);

    useEffect(() => {
        if (access !== "allowed") return;
        api.get("/tools/ce/state").then((r) => {
            setCeState(r.data?.state || null);
        }).catch(() => setCeState(null));
    }, [access]);

    // ---- Selected service row + unit ----
    const selectedRow = useMemo(() => {
        const row = (servicesData.services || []).find((r) => r.service === service);
        return row || null;
    }, [servicesData, service]);

    const activeUnit = useMemo(() => {
        if (service === "Transport" && transportUnit === "kilometre") return "kilometre";
        return selectedRow?.unit || "hour";
    }, [service, transportUnit, selectedRow]);

    // ---- Prefill from recent decoded statements ----
    const [prefillItems, setPrefillItems] = useState(null);
    useEffect(() => {
        if (access !== "allowed") return;
        api.get("/statements/recent-line-items")
            .then((r) => setPrefillItems(r.data?.items || []))
            .catch(() => setPrefillItems([]));
    }, [access]);

    const applyPrefill = (item) => {
        setService(item.service);
        setRate(String(item.unit_price));
        setContinueAnyway(false);
        setResult(null);
        try { track.ppc.prefillApplied({ service: item.service, statement_id: item.statement_id }); } catch (_) { /* noop */ }
    };

    // ---- Submit ----
    const submit = async () => {
        setError(null);
        setResult(null);
        setLoading(true);
        try {
            const body = {
                service,
                rate: parseFloat(rate),
                provider: provider || null,
                snapshot_id: selectedSnapshot,
                pension_status: (ceState?.pension_status || inlinePension || null) || null,
                is_grandfathered: isGrandfathered,
                after_hours_toggle: afterHoursToggle,
                check_date: new Date().toISOString().slice(0, 10),
                unit_override: (service === "Transport" ? transportUnit : null),
                user_ind_rate_pct: ceState?.independence_rate_pct ?? null,
                user_ev_rate_pct: ceState?.everyday_rate_pct ?? null,
            };
            try { track.ppc.serviceSelected({ service, snapshot_id: selectedSnapshot }); } catch (_) { /* noop */ }
            const { data } = await api.post("/public/price-check-v2", body);
            setResult(data);
            if (data?.quality_guard) {
                try { track.ppc.qualityGuardShown({ service, guard_type: data.quality_guard.guard_type }); } catch (_) { /* noop */ }
            }
        } catch (err) {
            setError(extractErrorMessage(err, "Could not check price."));
        } finally {
            setLoading(false);
        }
    };

    const dismissGuard = () => {
        try {
            if (result?.quality_guard) {
                track.ppc.qualityGuardDismissed({
                    service,
                    guard_type: result.quality_guard.guard_type,
                });
            }
        } catch (_) { /* noop */ }
        setContinueAnyway(true);
    };

    const grouped = useMemo(() => {
        const g = { Clinical: [], Independence: [], "Everyday Living": [] };
        (servicesData.services || []).forEach((r) => {
            if (!r.checkable && !r.available) {
                (g[r.stream] || (g[r.stream] = [])).push(r);
            } else {
                (g[r.stream] || (g[r.stream] = [])).push(r);
            }
        });
        return g;
    }, [servicesData]);

    // ---- Guards + rendering ----
    const guard = result?.quality_guard;
    const showGuardBlockingResult = guard && !continueAnyway;

    if (access === "loading") return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolPriceChecker} jsonLd={_toolJsonLd(SEO.toolPriceChecker)} />
            <MarketingHeader />
            <div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <ToolRelatedLinks slug="provider-price-checker" />
            <Footer />
        </div>
    );

    if (access === "blocked") return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolPriceChecker} jsonLd={_toolJsonLd(SEO.toolPriceChecker)} />
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-8">
                <CapDeferralNote note={result?.cap_deferral_note} />
            </section>
            <ToolHero toolKey="provider-price-checker" />
            <ToolGate toolName="Provider Price Checker"><ScreenshotStatement /></ToolGate>
            <section className="max-w-5xl mx-auto px-4 sm:px-8">
                <ToolExplainer toolKey="provider-price-checker" />
            </section>
            <ToolRelatedLinks slug="provider-price-checker" />
            <Footer />
        </div>
    );

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolPriceChecker} jsonLd={_toolJsonLd(SEO.toolPriceChecker)} />
            <MarketingHeader />

            <section className="mx-auto max-w-4xl px-6 pt-12 pb-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-4 flex-wrap">
                        <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k" data-testid="pc-back-link">← All AI Tools</Link>
                        <AboutBackLink />
                    </div>
                    <Link to="/tools/price-checker/history" className="text-sm text-primary-k hover:underline inline-flex items-center gap-1" data-testid="pc-history-link">
                        Your price history <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight" data-testid="pc-title">Provider Price Checker</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    {"Tell us what you are being charged. We compare your provider's rate against the Department of Health's indicative price range for that service, and show your out-of-pocket share."}
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20">

                <SnapshotSelector
                    snapshots={snapshotList}
                    selected={selectedSnapshot}
                    onChange={(v) => { setSelectedSnapshot(v); try { track.ppc.snapshotSwitched({ snapshot_id: v }); } catch (_) { /* noop */ } }}
                />

                <CapDeferralNote />

                {/* Grandfathered gate (§3.5) */}
                <GrandfatheredGate value={isGrandfathered} onChange={setIsGrandfathered} />

                {/* WS4, Decoder integration panel, feature-flag gated */}
                <DecoderContextPanel service={service} />

                {/* Prefill from recent statements */}
                {prefillItems && prefillItems.length > 0 && (
                    <div className="mb-4 bg-surface border border-kindred rounded-2xl p-5" data-testid="pc-prefill">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="h-4 w-4 text-primary-k" aria-hidden="true" />
                            <div className="font-medium text-primary-k">From your recent statements</div>
                        </div>
                        <p className="text-xs text-muted-k mb-3">Tap a line to copy its service and rate into the checker.</p>
                        <div className="flex flex-wrap gap-2">
                            {prefillItems.slice(0, 12).map((it, i) => (
                                <button
                                    key={`${it.service}-${it.unit_price}-${i}`}
                                    type="button"
                                    onClick={() => applyPrefill(it)}
                                    data-testid={`pc-prefill-item-${i}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-kindred bg-surface-2 hover:bg-primary-k hover:text-white hover:border-primary-k text-primary-k px-3 py-1.5 text-xs transition-colors"
                                    title={it.raw_service ? `${it.raw_service}, ${it.period_label || ''}` : it.service}
                                >
                                    <span className="font-medium">{it.service}</span>
                                    <span className="tabular-nums">{formatAUD2(it.unit_price)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Grandfathered explanation panel (when checked) */}
                {isGrandfathered && (
                    <div
                        className="mb-4 bg-clay/10 border border-clay/25 rounded-2xl p-5 text-sm text-primary-k leading-relaxed"
                        data-testid="pc-grandfathered-panel"
                    >
                        <div className="font-medium mb-1">Grandfathered pricing applies</div>
                        <p>
                            {"DoH indicative ranges are for Support at Home participants. If you're still on HCP transitional pricing, your rates and contribution are set by that arrangement instead. You can still check any provider's rate here for context."}
                        </p>
                        <div className="mt-3">
                            <Link to="/ai-tools/reassessment-letter" className="text-sm text-clay underline inline-flex items-center gap-1" data-testid="pc-reassessment-link">
                                Draft a reassessment letter <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                )}

                {/* --- Input form --- */}
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-5" data-testid="price-checker">
                    <label className="block">
                        <span className="text-sm text-muted-k">Service</span>
                        <select
                            value={service}
                            onChange={(e) => { setService(e.target.value); setResult(null); setContinueAnyway(false); }}
                            data-testid="pc-service"
                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                        >
                            {["Clinical", "Independence", "Everyday Living"].map((streamName) => (
                                <optgroup label={streamName} key={streamName}>
                                    {(grouped[streamName] || []).map((r) => (
                                        <option key={r.service} value={r.service}>
                                            {r.service}{!r.checkable ? ", no range published" : ""}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>

                    {service === "Transport" && (
                        <div className="text-sm">
                            <span className="text-muted-k">Charged by:</span>
                            <label className="ml-3 inline-flex items-center gap-1.5">
                                <input type="radio" name="pc-transport-unit" value="trip" checked={transportUnit === "trip"} onChange={() => setTransportUnit("trip")} data-testid="pc-transport-per-trip" />
                                <span className="text-primary-k">per trip</span>
                            </label>
                            <label className="ml-3 inline-flex items-center gap-1.5">
                                <input type="radio" name="pc-transport-unit" value="kilometre" checked={transportUnit === "kilometre"} onChange={() => setTransportUnit("kilometre")} data-testid="pc-transport-per-km" />
                                <span className="text-primary-k">per kilometre</span>
                            </label>
                        </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-4">
                        <label className="block">
                            <span className="text-sm text-muted-k">Rate charged ({UNIT_LABEL[activeUnit] || "$ per unit"})</span>
                            <input
                                type="number"
                                value={rate}
                                onChange={(e) => { setRate(e.target.value); setResult(null); setContinueAnyway(false); }}
                                placeholder="e.g. 100"
                                data-testid="pc-rate"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k tabular-nums"
                                min="0"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm text-muted-k">Provider (optional)</span>
                            <input
                                value={provider}
                                onChange={(e) => setProvider(e.target.value)}
                                placeholder="Provider name"
                                data-testid="pc-provider"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                            />
                            <span className="mt-1 block text-xs text-muted-k">Optional. Helps Wayly build a provider price picture.</span>
                        </label>
                    </div>

                    {/* Inline pension picker (§4.3), visible when CE state absent */}
                    {!ceState && (
                        <div className="bg-surface-2 border border-kindred rounded-xl p-4" data-testid="pc-inline-picker">
                            <div className="text-sm text-primary-k font-medium">Which best describes you?</div>
                            <p className="text-xs text-muted-k mt-0.5 mb-3">{'This determines your share of the rate. Optional, but it makes the "Your Share" figure real.'}</p>
                            <div className="grid sm:grid-cols-2 gap-2">
                                {[
                                    { key: "full", label: "Full Age Pension" },
                                    { key: "part", label: "Part Age Pension" },
                                    { key: "cshc", label: "Commonwealth Seniors Health Card" },
                                    { key: "self", label: "Self-funded" },
                                ].map((opt) => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => setInlinePension(opt.key)}
                                        data-testid={`pc-pension-${opt.key}`}
                                        className={`text-left px-3 py-2 rounded-md border text-sm transition-colors ${inlinePension === opt.key ? "bg-primary-k text-white border-primary-k" : "bg-surface border-kindred text-primary-k hover:border-primary-k"}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 text-xs">
                                <Link to="/ai-tools/contribution-estimator" className="text-primary-k underline inline-flex items-center gap-1" data-testid="pc-ce-link">
                                    Run full Contribution Estimator <ArrowRight className="h-3 w-3" />
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* Stale CE state prompt (§4.3, >12mo) */}
                    {ceState && isStale(ceState.created_at) && (
                        <div className="bg-clay/10 border border-clay/25 rounded-xl p-4 text-xs text-primary-k" data-testid="pc-ce-stale">
                            Your Contribution Estimator inputs are from {formatDate(ceState.created_at)}. Contribution rates change each year on 1 July. <Link to="/ai-tools/contribution-estimator" className="underline">Update your inputs</Link> to confirm the current rate applies.
                        </div>
                    )}

                    <button
                        onClick={submit}
                        disabled={loading || !rate}
                        data-testid="pc-submit"
                        className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Checking…" : "Check this price"}
                    </button>

                    {error && <div className="text-sm text-terracotta" data-testid="pc-error">{error}</div>}
                </div>

                {/* ------- Result region ------- */}
                {result && (
                    <div className="mt-6 space-y-5 animate-fade-up" data-testid="pc-result">

                        {/* Quality guard soft-confirm (§4.5) */}
                        {showGuardBlockingResult && (
                            <QualityGuardPanel
                                guard={guard}
                                onContinue={dismissGuard}
                                onAfterHours={() => { setAfterHoursToggle(true); setContinueAnyway(false); submit(); }}
                                testId="pc-quality-guard"
                            />
                        )}

                        {!showGuardBlockingResult && result.direction === "non_checkable" && (
                            <NonCheckablePanel result={result} />
                        )}

                        {!showGuardBlockingResult && result.direction !== "non_checkable" && (
                            <ResultCard
                                result={result}
                                onAdmOpen={() => setAdmOpen(true)}
                                provider={provider}
                                selectedSnapshot={selectedSnapshot}
                                ceState={ceState}
                                inlinePension={inlinePension}
                            />
                        )}

                        {/* UXF-1 v3 spec 3.22, data freshness indicator. */}
                        {isEnabled("uxf_v3.provenance") && result.source_date && (
                            <DataFreshnessIndicator
                                date={result.source_date}
                                sourceUrl="https://www.health.gov.au/topics/aged-care/support-at-home/prices"
                                sourceLabel="Department of Health, Summary of indicative Support at Home prices"
                                testId="pc-freshness"
                            />
                        )}

                        {/* UXF-1 v3 spec 3.23, automated decision disclosure. */}
                        {isEnabled("uxf_v3.disclosure") && (
                            <AutomatedDecisionDisclosure
                                body="This price comparison was calculated automatically from the rate you entered against the Department of Health indicative range. It is a guide, not financial advice. You can ask any Wayly team member to check the numbers."
                                contactUrl="/contact"
                                testId="pc-automated-decision"
                            />
                        )}
                    </div>
                )}

                <HowThisWorksPanel bullets={result?.how_this_works_bullets} />
            </section>

            <section className="max-w-5xl mx-auto px-4 sm:px-8">
                <ToolExplainer toolKey="provider-price-checker" />
            </section>
            <ToolRelatedLinks slug="provider-price-checker" />
            <Footer />

            {/* ADM disclosure modal (§WS14), shared Wayly-wide component */}
            <ADMDisclosure
                open={admOpen}
                onOpenChange={setAdmOpen}
                toolName="the Provider Price Checker"
                inputSummary={`The rate you entered for ${service.toLowerCase()}`}
                referenceLabel={`the Department of Health's published indicative range in the DoH ${result?.source_date || "October 2025"} snapshot`}
                computationRule={'If your rate is inside the published range, we report "in range." If it is above the top of the range, we report "above range" and calculate how many dollars above the top. If it is below the bottom, we report "below range."'}
                testIdPrefix="pc-adm"
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CapDeferralNote({ note }) {
    const url = note?.citation?.url || "https://www.health.gov.au/ministers/the-hon-sam-rae-mp/media/strengthening-consumer-protections-for-older-australians";
    return (
        <div data-testid="pc-caps-note" className="mb-4 bg-surface-2 border border-kindred rounded-xl p-4 text-sm text-primary-k leading-relaxed">
            <span className="font-medium">Price caps deferred.</span>{" "}
            The Australian Government has deferred the planned 1 July 2026 national provider price caps under Support at Home indefinitely. Providers continue to set their own prices. {"This tool compares your provider's rate against the indicative ranges published by the Department of Health, not a government cap."}{" "}
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-k underline inline-flex items-center gap-0.5"
                data-testid="pc-cap-citation-link"
            >
                Source: Minister for Aged Care media release, May 2026 <ExternalLink className="h-3 w-3" />
            </a>
        </div>
    );
}

function GrandfatheredGate({ value, onChange }) {
    return (
        <div className="mb-4 bg-surface border border-kindred rounded-2xl p-4 flex items-start gap-3" data-testid="pc-grandfathered-gate">
            <input
                type="checkbox"
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-kindred text-primary-k focus:ring-primary-k"
                data-testid="pc-grandfathered-checkbox"
                id="pc-gf-check"
            />
            <label htmlFor="pc-gf-check" className="text-sm text-primary-k cursor-pointer">
                Are you on grandfathered Home Care Package transitional pricing? <span className="text-muted-k">(You were on HCP before 1 November 2025 and have not moved to Support at Home pricing.)</span>
            </label>
        </div>
    );
}

function QualityGuardPanel({ guard, onContinue, onAfterHours, testId }) {
    return (
        <div className="bg-clay/10 border border-clay/30 rounded-2xl p-6" data-testid={testId}>
            <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-clay flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                    <div className="font-medium text-primary-k">Quick sanity check</div>
                    <p className="text-sm text-primary-k mt-1 leading-relaxed">{guard.prompt}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {guard.after_hours_toggle_available && (
                            <button
                                type="button"
                                onClick={onAfterHours}
                                className="px-3.5 py-2 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33]"
                                data-testid="pc-guard-after-hours"
                            >
                                Yes, this was after-hours
                            </button>
                        )}
                        {guard.allow_continue && (
                            <button
                                type="button"
                                onClick={onContinue}
                                className="px-3.5 py-2 rounded-full border border-primary-k text-primary-k text-sm hover:bg-primary-k hover:text-white"
                                data-testid="pc-guard-continue"
                            >
                                Continue anyway
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function NonCheckablePanel({ result }) {
    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-4" data-testid="pc-non-checkable">
            <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary-k flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                    <div className="font-heading text-2xl text-primary-k">No indicative range for this fee type</div>
                    <p className="mt-2 text-primary-k leading-relaxed">{result.plain_language}</p>
                    <p className="mt-3 text-sm text-muted-k">You can still save the rate to your history, and Wayly will alert you if the fee changes over time.</p>
                </div>
            </div>
        </div>
    );
}

function ResultCard({ result, onAdmOpen, provider, selectedSnapshot, ceState, inlinePension }) {
    const pos = result.position || "in";
    const tone = POSITION_TONE[pos] || POSITION_TONE.in;
    const [emailOpen, setEmailOpen] = useState(false);
    const access = useToolAccess();

    // Fire the result-rendered analytics event once per new result payload.
    useEffect(() => {
        try {
            track.ppc.resultRendered({
                service: result.service,
                position: result.position,
                stream: result.stream,
                has_share: Boolean(result?.your_share?.amount),
            });
        } catch (_) { /* noop */ }
    }, [result]);

    // Persist inline pension pick to CE state so future loads read-through.
    useEffect(() => {
        if (!ceState && inlinePension) {
            try { api.put("/tools/ce/state", { pension_status: inlinePension }); } catch (_) { /* noop */ }
        }
    }, [ceState, inlinePension]);

    return (
        <>
            <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="pc-how-this-compares">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="overline text-muted-k">How this compares</div>
                        <div className={`mt-2 font-heading text-3xl leading-tight ${tone.text}`} data-testid="pc-position">
                            {result.plain_language}
                        </div>
                        {result.distance_summary && (
                            <div className="mt-2 text-primary-k tabular-nums" data-testid="pc-distance">
                                {result.distance_summary}
                            </div>
                        )}
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {result.stream && (
                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${(STREAM_TONE[result.stream] || {}).bg || "bg-surface-2"} ${(STREAM_TONE[result.stream] || {}).text || "text-primary-k"}`} data-testid="pc-stream">
                                        {result.stream} <HelpCircle className="h-3 w-3 ml-1 opacity-70" />
                                    </span>
                                )}
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                                Every SAH service sits in one of three streams (Clinical, Independence, Everyday Living). The stream determines your contribution rate.
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {result.doh_caveat && (
                    <p
                        className="mt-4 text-sm bg-surface-2 border border-kindred rounded-xl p-4 text-primary-k italic leading-relaxed"
                        data-testid="pc-doh-caveat"
                    >
                        {result.doh_caveat}
                    </p>
                )}

                {/* ADM disclosure link (§WS14) */}
                <div className="mt-3">
                    <ADMDisclosureTrigger onClick={onAdmOpen} testId="pc-adm-link" />
                </div>
            </div>

            {/* Three stat cards */}
            <div className="grid sm:grid-cols-3 gap-3">
                <StatCard label="You are charged" amount={result.charged} unit={result.unit} testId="pc-stat-charged" />
                <ShareStatCard share={result.your_share} unit={result.unit} />
                {(result.lower != null && result.upper != null) ? (
                    <div className="bg-surface border border-kindred rounded-xl p-4" data-testid="pc-range">
                        <div className="text-xs uppercase tracking-wider text-muted-k">Indicative range</div>
                        <div className="mt-1 text-2xl text-primary-k tabular-nums">
                            <NumberMono>{formatAUD2(result.lower)} to {formatAUD2(result.upper)}</NumberMono>
                        </div>
                        <div className="text-xs text-muted-k mt-0.5">DoH {formatSnapshotDate(result.source_date)}</div>
                    </div>
                ) : (
                    <div className="bg-surface-2 border border-kindred rounded-xl p-4" data-testid="pc-range-unavailable">
                        <div className="text-xs uppercase tracking-wider text-muted-k">Indicative range</div>
                        <div className="mt-1 text-sm text-muted-k">Not published for this service in the current DoH snapshot.</div>
                    </div>
                )}
            </div>

            <div className="text-xs text-muted-k px-1" data-testid="pc-source-line">
                Indicative median: {result.median != null ? formatAUD2(result.median) : "unavailable"} {result.unit ? `per ${result.unit}` : ""} (DoH, {formatSnapshotDate(result.source_date)}).
            </div>

            {result.personal_care_transitional_note && (
                <div className="bg-surface-2 border border-kindred rounded-xl p-4 text-sm text-primary-k" data-testid="pc-transitional-note">
                    <span className="font-medium">Coming soon: </span>{result.personal_care_transitional_note}
                </div>
            )}

            {result.after_hours_note && (
                <div className="bg-surface-2 border border-kindred rounded-xl p-4 text-sm text-primary-k" data-testid="pc-after-hours-note">
                    {result.after_hours_note}
                </div>
            )}

            {result.nursing_consumables_note && (
                <div className="bg-surface-2 border border-kindred rounded-xl p-4 text-sm text-primary-k" data-testid="pc-nursing-note">
                    {result.nursing_consumables_note}
                </div>
            )}

            {/* WS8, action bar: Save, PDF, Email, Report an issue */}
            <div className="bg-surface border border-kindred rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <SaveCheckButton
                        result={result}
                        provider={provider}
                        snapshotId={selectedSnapshot}
                        ceState={ceState}
                        onSaved={() => { /* future: flash the increase chip */ }}
                    />
                    <PdfExportButton result={result} provider={provider} ceState={ceState} />
                    <button
                        type="button"
                        onClick={() => setEmailOpen(true)}
                        data-testid="pc-open-email"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary-k text-primary-k text-sm hover:bg-primary-k hover:text-white transition-colors"
                    >
                        <Mail className="h-4 w-4" />
                        Email the provider
                    </button>
                </div>
                <div className="mt-3">
                    <ReportIssueButton
                        variant="inline"
                        toolName="Provider Price Checker"
                        toolVersion="PPC-1 v2"
                        toolInput={{ service: result.service, rate: result.charged, provider }}
                        toolOutput={result}
                    />
                </div>
            </div>

            <EmailProviderModal
                open={emailOpen}
                onOpenChange={setEmailOpen}
                result={result}
                provider={provider}
            />

            <div className="bg-surface-2 rounded-xl p-5 border border-kindred" hidden={access === "allowed"}>
                <div className="font-medium text-primary-k">Want every charge checked automatically?</div>
                <p className="text-sm text-muted-k mt-1">Wayly compares every line on every statement against the DoH indicative range plus our anonymised network, and tells you the moment something looks off.</p>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <Link to="/signup" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#091D33]" data-testid="pc-signup-cta">Start free trial</Link>
                    <Link to="/ai-tools/statement-decoder" className="text-sm text-primary-k underline inline-flex items-center gap-1" data-testid="pc-decoder-link">
                        Decode a full statement <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>
        </>
    );
}

function StatCard({ label, amount, unit, testId }) {
    return (
        <div className="bg-surface border border-kindred rounded-xl p-4" data-testid={testId}>
            <div className="text-xs uppercase tracking-wider text-muted-k">{label}</div>
            <div className="mt-1 text-2xl text-primary-k tabular-nums"><NumberMono>{formatAUD2(amount)}</NumberMono></div>
            {unit && <div className="text-xs text-muted-k mt-0.5">{UNIT_WORD[unit] || `per ${unit}`}</div>}
        </div>
    );
}

function ShareStatCard({ share, unit }) {
    if (!share) return null;
    const testId = "pc-your-share";
    if (share.mode === "picker") {
        return (
            <div className="bg-surface-2 border border-kindred rounded-xl p-4" data-testid={testId}>
                <div className="text-xs uppercase tracking-wider text-muted-k">Your share</div>
                <div className="mt-1 text-sm text-muted-k">Choose your situation above to see your out-of-pocket per unit.</div>
            </div>
        );
    }
    if (share.mode === "grandfathered") {
        return (
            <div className="bg-clay/10 border border-clay/25 rounded-xl p-4" data-testid={testId}>
                <div className="text-xs uppercase tracking-wider text-muted-k">Your share</div>
                <div className="mt-1 text-sm text-primary-k leading-snug">{share.explanation}</div>
            </div>
        );
    }
    if (share.mode === "clinical") {
        return (
            <div className="bg-sage/10 border border-sage/25 rounded-xl p-4" data-testid={testId}>
                <div className="text-xs uppercase tracking-wider text-muted-k">Your share</div>
                <div className="mt-1 text-2xl text-primary-k tabular-nums"><NumberMono>{formatAUD2(0)}</NumberMono></div>
                {unit && <div className="text-xs text-muted-k mt-0.5">{UNIT_WORD[unit] || `per ${unit}`}</div>}
                <div className="text-xs text-primary-k mt-1">{share.explanation}</div>
            </div>
        );
    }
    if (share.mode === "band") {
        return (
            <div className="bg-surface-2 border border-kindred rounded-xl p-4" data-testid={testId}>
                <div className="text-xs uppercase tracking-wider text-muted-k">Your share (range)</div>
                <div className="mt-1 text-lg text-primary-k tabular-nums">
                    {formatAUD2(share.band?.share_low || 0)} to {formatAUD2(share.band?.share_high || 0)}
                </div>
                <div className="text-xs text-muted-k mt-1 leading-snug">{share.explanation}</div>
            </div>
        );
    }
    if (share.mode === "unavailable") {
        return (
            <div className="bg-surface-2 border border-kindred rounded-xl p-4" data-testid={testId}>
                <div className="text-xs uppercase tracking-wider text-muted-k">Your share</div>
                <div className="mt-1 text-sm text-muted-k leading-snug">{share.explanation}</div>
            </div>
        );
    }
    return (
        <div className="bg-surface border border-kindred rounded-xl p-4" data-testid={testId}>
            <div className="text-xs uppercase tracking-wider text-muted-k">Your share</div>
            <div className="mt-1 text-2xl text-primary-k tabular-nums"><NumberMono>{formatAUD2(share.amount || 0)}</NumberMono></div>
            {unit && <div className="text-xs text-muted-k mt-0.5">{UNIT_WORD[unit] || `per ${unit}`}</div>}
            {share.rate_pct != null && <div className="text-xs text-muted-k mt-1">{share.rate_pct}% contribution rate</div>}
        </div>
    );
}

function HowThisWorksPanel({ bullets }) {
    const items = bullets || [
        "Under Support at Home, providers set their own prices.",
        "The Department of Health publishes indicative price ranges based on a February 2025 survey of over 300 HCP providers.",
        "The Price Checker compares your provider's rate against those indicative ranges. It does not compare against a legislated cap because none is currently in force.",
        "The Australian Government has deferred the planned 1 July 2026 price caps indefinitely.",
        "Prices delivered outside standard business hours may be higher than the indicative range.",
        "Nursing hourly prices include the cost of everyday nursing consumables the nurse carries.",
        "The indicative ranges are a market snapshot from a survey. They are not a guarantee that in-range prices are fair or that above-range prices are unfair.",
    ];
    return (
        <details className="mt-8 bg-surface border border-kindred rounded-xl p-5 text-sm text-muted-k group" data-testid="pc-how-this-works">
            <summary className="cursor-pointer overline text-muted-k list-none flex items-center gap-2">
                How this works
                <ChevronDown className="h-4 w-4 group-open:rotate-180 transition-transform" />
            </summary>
            <ul className="mt-3 space-y-2 list-disc list-outside pl-5 leading-relaxed">
                {items.map((b, i) => <li key={i} data-testid={`pc-hw-item-${i}`}>{b}</li>)}
            </ul>
        </details>
    );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function formatSnapshotDate(iso) {
    if (!iso) return "October 2025";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    } catch { return iso; }
}

function formatDate(iso) {
    if (!iso) return "unknown date";
    try {
        return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    } catch { return iso; }
}

function isStale(iso) {
    if (!iso) return false;
    try {
        const d = new Date(iso);
        const twelveMoAgo = new Date();
        twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);
        return d < twelveMoAgo;
    } catch { return false; }
}
