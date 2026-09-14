import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Info, Shield, ShieldAlert, ShieldCheck, AlertOctagon, FileDown, Share2, HelpCircle, PenLine, FileText } from "lucide-react";
import { NumberMono } from "@/components/ToolShell";
import { downloadDecodedAsCsv, downloadDecodedAsPdf, downloadShareablePdf } from "@/lib/decoderExport";
import { formatDate } from "@/lib/formatDate";
import { getAnomalyExplainer, shortRuleLabel } from "@/lib/anomalyExplainer";
import FlagCard from "@/components/FlagCard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { readPersonaPreview } from "@/lib/persona";

function aud(n) {
    if (n == null) return "—";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

/**
 * DEC-1 v5 · Phase 2b: render the `quantity · unit` pair on a line item.
 * Prefer the v5 fields (`quantity` + `unit`) when the LLM populated them.
 * Fall back to `hours` for pre-v5 rows (hours→ 'hr' assumed by the read-time
 * backfill). Returns "" when nothing is known.
 */
function formatQtyUnit(li) {
    if (!li) return "";
    const q = li.quantity;
    const u = li.unit;
    if (q != null && u) {
        // 2.00 hr, 18 km, 1 session.
        const n = Number(q);
        const disp = (u === "hr") ? n.toFixed(2) : Number.isInteger(n) ? String(n) : n.toFixed(2);
        return `${disp} ${u}`;
    }
    if (li.hours != null && li.hours !== "") {
        const h = Number(li.hours);
        if (!isNaN(h) && h > 0) return `${h.toFixed(2)} hr`;
    }
    return "";
}
const SEV_META = {
    high:   { label: "High",   bg: "bg-terracotta",  fg: "text-white", Icon: AlertOctagon },
    medium: { label: "Medium", bg: "bg-gold",        fg: "text-white", Icon: ShieldAlert },
    low:    { label: "Low",    bg: "bg-sage",        fg: "text-white", Icon: Shield },
    informational: { label: "Informational", bg: "bg-sage/20", fg: "text-[#0F5648]", Icon: Info },
};

// DOC-PARITY-1 v2 decision 5: four severity bands, rendered High → Medium →
// Low → Informational everywhere. `info` and `advisory` collapse into the
// Informational band.
const BANDS = ["high", "medium", "low", "informational"];
const bandOf = (sev) => {
    const s = (sev || "").toLowerCase();
    if (s === "info" || s === "informational" || s === "advisory") return "informational";
    if (s === "high" || s === "medium" || s === "low") return s;
    return "low";
};
const BAND_HEADER = {
    high: "High priority",
    medium: "Medium",
    low: "Low",
    informational: "Informational",
};

/**
 * Rule badge with a hover/tap tooltip that shows the plain-English
 * "what this means" for the deterministic rule that fired. Falls back
 * gracefully when the rule code is not in the explainer library.
 */
function RuleBadge({ rule }) {
    if (!rule) return null;
    const info = getAnomalyExplainer(rule);
    const short = shortRuleLabel(rule);
    if (!info) {
        return (
            <span
                className="text-[10px] text-muted-k uppercase tracking-wider"
                data-testid={`anomaly-rule-badge-${rule}`}
            >
                {short}
            </span>
        );
    }
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className="text-[10px] text-muted-k uppercase tracking-wider inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors cursor-help"
                    aria-label={`What does ${info.title} mean?`}
                    data-testid={`anomaly-rule-badge-${rule}`}
                >
                    <HelpCircle className="h-3 w-3 opacity-60" aria-hidden="true" />
                    <span>{short}</span>
                </button>
            </TooltipTrigger>
            <TooltipContent
                side="top"
                align="start"
                className="max-w-xs bg-primary text-primary-foreground text-xs leading-relaxed p-3 rounded-lg shadow-lg"
                data-testid={`anomaly-rule-tooltip-${rule}`}
            >
                <div className="font-semibold text-[11px] uppercase tracking-wider mb-1 opacity-80">
                    {info.title}
                </div>
                <div>{info.explanation}</div>
            </TooltipContent>
        </Tooltip>
    );
}
// eslint-disable-next-line no-unused-vars
const _RuleBadgeKeepAlive = RuleBadge;
const STREAM_LABEL = {
    Clinical: "Clinical",
    Independence: "Independence",
    EverydayLiving: "Everyday Living",
    ATHM: "AT-HM (assistive tech & home mods)",
    CareMgmt: "Care Management",
};

/**
 * Rich 4-section result view for the two-pass Statement Decoder.
 * Renders the Pass-2 audit JSON (statement_summary + stream_breakdown +
 * anomalies) plus the full line-item table from the Pass-1 extraction.
 */
/**
 * FeeBreakdown — Fee Transparency (Jun 2026). Breaks out services, care
 * management, package management and GST as their own rows so the total the
 * family sees always adds up on screen. Values come from the Pass-1 extraction
 * (falls back to the summary) and only non-zero components are shown.
 */
function FeeBreakdown({ extracted, summary }) {
    const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
    const round2 = (n) => Math.round(n * 100) / 100;
    const items = extracted?.line_items || [];
    const services = round2(items.filter((li) => !li.is_cancellation).reduce((s, li) => s + num(li.gross ?? li.total), 0));
    const careMgmt = num(extracted?.care_management_deducted ?? summary?.care_management_fee);
    const pkgMgmt = num(extracted?.package_management_deducted);
    const gst = num(extracted?.gst_total);
    const cancellations = round2(items.filter((li) => li.is_cancellation).reduce((s, li) => s + num(li.charged_amount), 0));
    const credits = round2((extracted?.previous_period_adjustments || []).reduce((s, a) => s + num(a?.credit_amount), 0));
    const reported = num(extracted?.reported_total_gross ?? summary?.total_gross);
    const computed = round2(services + careMgmt + pkgMgmt + gst + cancellations - credits);
    const rows = [
        { label: "Services", value: services, always: true },
        { label: "Care management", value: careMgmt },
        { label: "Package management", value: pkgMgmt },
        { label: "GST", value: gst },
        { label: "Charged cancellations", value: cancellations },
        { label: "Credits applied", value: credits, neg: true },
    ].filter((r) => r.always || Math.abs(r.value) > 0.005);
    if (rows.length <= 1 && reported <= 0) return null;
    const total = reported > 0 ? reported : computed;
    const reconciles = Math.abs(computed - total) <= Math.max(5, 0.02 * total);
    return (
        <section data-testid="decoder-fee-breakdown" className="rounded-2xl border border-kindred bg-surface p-5">
            <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-heading text-lg text-primary-k">Where the money goes</h3>
                <span className="text-[11px] text-muted-k">Every fee, broken out</span>
            </div>
            <dl className="mt-3 divide-y divide-kindred">
                {rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between py-2 text-sm" data-testid={`decoder-fee-row-${r.label.toLowerCase().replace(/\s+/g, "-")}`}>
                        <dt className="text-muted-k">{r.label}</dt>
                        <dd className={`tabular-nums ${r.neg ? "text-sage" : "text-primary-k"}`}>{r.neg ? `− ${aud(Math.abs(r.value))}` : aud(r.value)}</dd>
                    </div>
                ))}
                <div className="flex items-center justify-between py-2.5 text-sm font-semibold" data-testid="decoder-fee-total">
                    <dt className="text-primary-k">Total billed</dt>
                    <dd className="tabular-nums text-primary-k">{aud(total)}</dd>
                </div>
            </dl>
            {reported > 0 && (
                <p className={`mt-1 text-[11px] ${reconciles ? "text-sage" : "text-terracotta"}`} data-testid="decoder-fee-reconcile-note">
                    {reconciles
                        ? "These rows add up to the statement's own total."
                        : `Heads up: these rows add to ${aud(computed)}, but the statement's own total is ${aud(reported)}.`}
                </p>
            )}
        </section>
    );
}

/**
 * ConfidenceLegend — a small "how we read this" note so families understand
 * what low-confidence and unverified figures mean BEFORE they act on them.
 */
function ConfidenceLegend({ lowConfidence, blocked, confidence }) {
    const pct = (typeof confidence === "number" && confidence > 0 && confidence <= 1)
        ? Math.round(confidence * 100)
        : null;
    return (
        <details className="rounded-xl border border-kindred bg-surface-2 px-4 py-3 text-sm" data-testid="decoder-confidence-legend">
            <summary className="cursor-pointer text-primary-k font-medium select-none list-none flex items-center gap-2">
                <Info className="h-4 w-4 text-primary-k" /> How we read this
                {pct !== null ? <span className="text-xs text-muted-k font-normal">· {pct}% read confidence</span> : null}
            </summary>
            <div className="mt-3 space-y-2 text-muted-k leading-relaxed">
                <p><span className="font-semibold text-gold">Low confidence</span> means some figures were hard to read (often a photo or a faint scan). We show our best reading, but double-check those against your original before acting on them.</p>
                <p><span className="font-semibold text-terracotta">Unverified</span> means the statement&apos;s own numbers do not add up, so we will not present a total as fact until the provider corrects or confirms it.</p>
                <p>Everything else has passed our reconciliation checks. Wayly is a reading assistant, not financial or legal advice.</p>
            </div>
        </details>
    );
}

export default function DecoderResultView({ result, onDraftLetter, onDraftAll }) {
    const audit = result.audit || {};
    const extracted = result.extracted || {};
    const summary = audit.statement_summary || {};
    const anoms = audit.anomalies || [];
    const counts = audit.anomaly_count || { high: 0, medium: 0, low: 0, advisory: 0 };
    const streams = audit.stream_breakdown || [];
    const items = extracted.line_items || [];
    // DEC-1 publish gate: the backend refuses to publish a plain-English
    // summary when the statement's own numbers do not reconcile. In that
    // case we must NOT present the (untrusted) totals banner as fact.
    const blocked = result.publishable === false;
    const publishBlock = result.publish_block || {};
    const blockMessage = typeof result.summary === "string" ? result.summary : "";
    const lowConfidence = !!result.low_confidence;
    const extractionConfidence = audit.extraction_confidence;
    // Fix-It Checklist: the full anomaly objects behind each publish blocker,
    // so the block panel can offer a one-tap "email my provider" letter per issue.
    const blockerRules = new Set((publishBlock.rules || []).map((r) => String(r || "").toUpperCase()));
    const blockerAnoms = anoms.filter((a) => blockerRules.has(String(a?.rule || "").toUpperCase()));
    // DOC-PARITY-1 decision 8: render the period as a DD/MM/YYYY range when we
    // have the ISO bounds, instead of the source's spelled-out label.
    const periodLabel = (extracted.period_start && extracted.period_end)
        ? `${formatDate(extracted.period_start)} to ${formatDate(extracted.period_end)}`
        : (summary.period || "Statement");

    // DOC-PARITY-1 decision 5: group the (already server-sorted) anomalies
    // into the four severity bands for collapsible rendering.
    const bandGroups = BANDS
        .map((band) => ({ band, items: anoms.filter((a) => bandOf(a?.severity) === band) }))
        .filter((g) => g.items.length > 0);

    const [openStreams, setOpenStreams] = useState({});
    const [showTable, setShowTable] = useState(false);

    // PERSONA-1 Workstream F, resolve the 4 DEC-1 Tier-1 keys through the
    // backend registry so the results view adapts to persona + pronouns.
    // Falls back to sensible caregiver defaults if the endpoint is
    // unavailable or the feature flag is off.
    const [personaCopy, setPersonaCopy] = useState({
        hero: "Here is what we found in the statement.",
        no_anomalies: "Statement looks clean. Nothing unusual found.",
        charged_correctly: "Everything on this statement has been charged in line with the Support at Home plan.",
        adm_disclosure: null,
    });
    useEffect(() => {
        let cancelled = false;
        const fetchCopy = async () => {
            try {
                const keys = [
                    "dec1.results.hero",
                    "dec1.results.no_anomalies",
                    "dec1.results.charged_correctly",
                    "dec1.adm_disclosure",
                ];
                const preview = readPersonaPreview();
                const body = { tier1_keys: keys };
                if (preview?.persona) body.override_persona = preview.persona;
                if (preview?.pronouns) body.override_pronouns = preview.pronouns;
                if (preview?.first_name !== undefined) body.override_first_name = preview.first_name || null;
                const { data } = await api.post("/persona/resolve", body);
                if (cancelled) return;
                const t = data?.tier1 || {};
                setPersonaCopy((cur) => ({
                    hero: t["dec1.results.hero"] || cur.hero,
                    no_anomalies: t["dec1.results.no_anomalies"] || cur.no_anomalies,
                    charged_correctly: t["dec1.results.charged_correctly"] || cur.charged_correctly,
                    adm_disclosure: t["dec1.adm_disclosure"] || cur.adm_disclosure,
                }));
            } catch { /* keep defaults on error */ }
        };
        fetchCopy();
        const onPreview = () => { fetchCopy(); };
        window.addEventListener("wayly:persona-preview-changed", onPreview);
        return () => {
            cancelled = true;
            window.removeEventListener("wayly:persona-preview-changed", onPreview);
        };
    }, []);

    const toggleStream = (s) => setOpenStreams((p) => ({ ...p, [s]: !p[s] }));

    const topBanner = counts.high > 0
        ? { cls: "bg-terracotta text-white border-terracotta", Icon: AlertOctagon, text: `${counts.high} high-priority thing${counts.high === 1 ? "" : "s"} to review.` }
        : counts.medium > 0
        ? { cls: "bg-gold/20 text-primary-k border-gold", Icon: ShieldAlert, text: `${counts.medium} thing${counts.medium === 1 ? "" : "s"} worth a closer look.` }
        : counts.low > 0
        ? { cls: "bg-sage/15 text-[#0F5648] border-sage", Icon: Info, text: `${counts.low} small note${counts.low === 1 ? "" : "s"}, mostly informational.` }
        : { cls: "bg-sage/15 text-[#0F5648] border-sage", Icon: ShieldCheck, text: `${personaCopy.no_anomalies} ✓` };
    const isClean = counts.high === 0 && counts.medium === 0 && counts.low === 0;

    return (
        <div className="space-y-6" data-testid="decoder-result-v2">
            {blocked && <PublishBlockPanel block={publishBlock} message={blockMessage} blockers={blockerAnoms} onDraftLetter={onDraftLetter} onDraftAll={onDraftAll} />}
            {lowConfidence && <LowConfidenceBanner confidence={extractionConfidence} />}
            {/* PERSONA-1 §F, persona-aware hero shown above everything else. */}
            {!blocked && (
                <h2
                    className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight"
                    data-testid="decoder-persona-hero"
                >
                    {personaCopy.hero}
                </h2>
            )}
            {isClean && !blocked && (
                <p className="text-muted-k text-sm leading-relaxed -mt-2" data-testid="decoder-charged-correctly">
                    {personaCopy.charged_correctly}
                </p>
            )}
            {/* Download bar, sits above the rich result so users always see it. */}
            <div className="flex items-center justify-between flex-wrap gap-3 bg-surface-2 border border-kindred rounded-lg px-4 py-3" data-testid="decoder-download-bar">
                <div className="text-sm text-muted-k">
                    Save a copy of this decoded statement for your records.
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => downloadShareablePdf(result)}
                        className="inline-flex items-center gap-1.5 text-sm bg-[#0E4D52] text-white rounded-md px-3 py-1.5 hover:bg-[#0A3B3F] shadow-sm transition-colors"
                        data-testid="decoder-share-pdf-btn"
                        title="One-page PDF you can forward to family, advisers, or anyone questioning the bill."
                    >
                        <Share2 className="h-3.5 w-3.5" /> Share this decode
                    </button>
                    <button
                        onClick={() => downloadDecodedAsCsv(result, "decoded-statement")}
                        className="inline-flex items-center gap-1.5 text-sm bg-[#425F47] text-white rounded-md px-3 py-1.5 hover:bg-[#33482F] shadow-sm"
                        data-testid="decoder-download-csv-btn"
                    >
                        <FileDown className="h-3.5 w-3.5" /> Download CSV
                    </button>
                    <button
                        onClick={() => downloadDecodedAsPdf(result, "decoded-statement")}
                        className="inline-flex items-center gap-1.5 text-sm bg-[#A5512B] text-white rounded-md px-3 py-1.5 hover:bg-[#8E4523] shadow-sm"
                        data-testid="decoder-download-pdf-btn"
                    >
                        <FileDown className="h-3.5 w-3.5" /> Download PDF
                    </button>
                </div>
            </div>

            {result.partial_result && (
                <div className="bg-gold/15 border border-gold/40 rounded-lg p-4 text-sm text-primary-k" data-testid="decoder-partial-warning">
                    <div className="font-medium">Partial result</div>
                    We had trouble reading parts of this statement. Here&apos;s what we could extract, a Wayly team member will review the rest within a few hours.
                </div>
            )}

            <InputMethodAccuracyNote method={result.input_method} parsingWarnings={result.parsing_warnings} />

            {/* SECTION 0 removed — the structured summary banner below is the
                single source of truth; the extra plain-English paragraph box
                was redundant (two summaries confused users). */}

            {/* SECTION 1, Summary banner — hidden when the statement is
                blocked, so untrusted totals are never presented as fact. */}
            {!blocked && (
            <section className="bg-primary-k text-white rounded-2xl p-6 relative" data-testid="decoder-summary-banner">
                <InputMethodBadge method={result.input_method} />
                <div className="text-[11px] uppercase tracking-[0.18em] text-white pr-32" data-testid="decoder-summary-header-line">
                    {periodLabel}
                    {summary.participant_name ? ` · ${summary.participant_name}` : ""}
                    {summary.classification ? ` · ${summary.classification}` : ""}
                    {summary.provider ? ` · ${summary.provider}` : ""}
                    {summary.cadence && summary.cadence !== "irregular"
                        ? ` · ${summary.cadence[0].toUpperCase() + summary.cadence.slice(1)}`
                        : ""}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Gross billed</div>
                        <div className="text-2xl mt-1"><NumberMono>{aud(summary.total_gross)}</NumberMono></div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Your contribution</div>
                        <div className="text-2xl mt-1 text-gold"><NumberMono>{aud(summary.total_participant_contribution)}</NumberMono></div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Government paid</div>
                        <div className="font-heading text-2xl mt-1 tabular-nums">{aud(summary.total_government_paid)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Budget remaining</div>
                        <div className="text-2xl mt-1"><NumberMono>{aud(summary.adjusted_budget_remaining ?? summary.budget_remaining)}</NumberMono></div>
                    </div>
                </div>
                {(summary.care_management_fee || summary.rollover_applied || summary.lifetime_cap_remaining != null || summary.cadence) && (
                    <div className="mt-4 pt-4 border-t border-white/15 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-white/70" data-testid="decoder-summary-meta">
                        {summary.cadence && summary.cadence !== "irregular" ? (
                            <span data-testid="decoder-cadence-chip">
                                Cadence <span className="text-white font-medium">{summary.cadence}</span>
                            </span>
                        ) : null}
                        {summary.care_management_fee ? <span>Care management fee {aud(summary.care_management_fee)}</span> : null}
                        {summary.rollover_applied ? <span>Rollover applied {aud(summary.rollover_applied)}</span> : null}
                        {summary.lifetime_cap_remaining != null ? <span>Lifetime cap remaining {aud(summary.lifetime_cap_remaining)}</span> : null}
                    </div>
                )}
                {(() => {
                    const you = Number(summary.total_participant_contribution) || 0;
                    const govt = Number(summary.total_government_paid) || 0;
                    const tot = you + govt;
                    if (tot <= 0) return null;
                    const govtPct = Math.round((govt / tot) * 100);
                    const youPct = 100 - govtPct;
                    return (
                        <div className="mt-4 pt-4 border-t border-white/15" data-testid="decoder-who-paid">
                            <div className="text-[10px] uppercase tracking-wider text-white/70 mb-2">Who paid what</div>
                            <div className="flex h-8 rounded-lg overflow-hidden">
                                <div className="flex items-center justify-center" style={{ width: `${govtPct}%`, backgroundColor: "#6E8B74" }}>
                                    {govtPct >= 18 ? <span className="text-[11px] font-semibold text-white">{govtPct}%</span> : null}
                                </div>
                                <div className="flex items-center justify-center" style={{ width: `${youPct}%`, backgroundColor: "#E0A64B" }}>
                                    {youPct >= 18 ? <span className="text-[11px] font-semibold text-[#1C2B2D]">{youPct}%</span> : null}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2.5 text-[11px] text-white/85" data-testid="decoder-who-paid-legend">
                                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#6E8B74" }} /> Government <strong className="font-semibold text-white ml-0.5 tabular-nums">{govtPct}%</strong></span>
                                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#E0A64B" }} /> You paid <strong className="font-semibold text-white ml-0.5 tabular-nums">{youPct}%</strong></span>
                            </div>
                            <div className="text-[11px] text-white/80 mt-2">The government covered {aud(govt)} of this statement; your share was {aud(you)}.</div>
                        </div>
                    );
                })()}
            </section>
            )}

            {/* SECTION 1B, Balance panel, opening + allocation + closing.
                Rendered when the extraction carried the rollover / quarterly
                budget context so participants can trace ledger continuity
                across monthly + quarterly statements. */}
            {!blocked && <BalancePanel extracted={extracted} summary={summary} audit={audit} />}

            {/* Confidence Legend + Fee Transparency (Jun 2026) */}
            <ConfidenceLegend lowConfidence={lowConfidence} blocked={blocked} confidence={extractionConfidence} />
            {!blocked && <FeeBreakdown extracted={extracted} summary={summary} />}

            {/* SECTION 2, Anomaly alert panel (always shown) */}
            <section data-testid="decoder-anomaly-panel">
              <TooltipProvider delayDuration={150}>
                <div className={`border-l-4 rounded-r-lg p-4 flex items-start gap-3 ${topBanner.cls}`} data-testid="anomaly-top-banner">
                    <topBanner.Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="text-sm font-medium">{topBanner.text}</div>
                </div>

                {bandGroups.map((g) => (
                    <SeverityGroup key={g.band} band={g.band} items={g.items} onDraftLetter={onDraftLetter} />
                ))}
              </TooltipProvider>
            </section>

            {/* SECTION 3, Stream breakdown — hidden when blocked. */}
            {!blocked && streams.length > 0 && (
                <section data-testid="decoder-stream-breakdown">
                    <div className="overline mb-3">Where the money went</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {streams.map((s, sIdx) => {
                            const isOpen = !!openStreams[s.stream];
                            const itemsInStream = items.filter((li) => li.stream === s.stream && !li.is_cancellation);
                            const STREAM_TONES = ["#0E4D52", "#A5512B", "#B23A2E", "#425F47", "#8A4423", "#0A3E42"];
                            const tone = STREAM_TONES[sIdx % STREAM_TONES.length];
                            return (
                                <div key={s.stream} className="border border-kindred rounded-xl overflow-hidden" data-testid={`stream-card-${s.stream}`}>
                                    <button
                                        type="button"
                                        onClick={() => toggleStream(s.stream)}
                                        style={{ backgroundColor: tone }}
                                        className="w-full text-left p-4 transition-opacity hover:opacity-90"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase tracking-[0.16em] text-white/70">{STREAM_LABEL[s.stream] || s.stream}</span>
                                            {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-white/80" /> : <ChevronDown className="h-3.5 w-3.5 text-white/80" />}
                                        </div>
                                        <div className="mt-1.5 text-xl text-white"><NumberMono>{aud(s.gross_total)}</NumberMono></div>
                                        <div className="text-[11px] text-white/70 mt-0.5">{s.line_item_count} item{s.line_item_count === 1 ? "" : "s"} · you paid <span className="font-semibold text-white">{aud(s.participant_contribution)}</span></div>
                                    </button>
                                    {isOpen && (
                                        <ul className="border-t border-kindred divide-y divide-kindred bg-surface-2">
                                            {itemsInStream.length === 0 ? (
                                                <li className="p-3 text-xs text-muted-k">No line items in this stream.</li>
                                            ) : itemsInStream.map((li, i) => (
                                                <li key={i} className="p-3 text-xs flex items-center justify-between gap-2">
                                                    <span className="text-primary-k truncate">{formatDate(li.date) || ", "} · {li.service_description || "Service"}</span>
                                                    <span className="tabular-nums text-primary-k flex-shrink-0">{aud(li.gross)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* SECTION 4, Full line-item table (collapsed by default) */}
            {items.length > 0 && (
                <section data-testid="decoder-full-table">
                    {blocked && (
                        <p className="text-xs text-muted-k mb-2" data-testid="decoder-table-unverified-note">
                            These line items are shown exactly as decoded. The totals have not been verified because the statement does not reconcile, so treat every figure as unconfirmed until the provider corrects it.
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowTable((s) => !s)}
                        data-testid="decoder-table-toggle"
                        className="inline-flex items-center gap-2 text-sm text-primary-k hover:underline"
                    >
                        {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {showTable ? "Hide" : "Show"} full line-item table ({items.length})
                    </button>
                    {showTable && (
                        <>
                        {/* Mobile: stacked cards */}
                        <div className="md:hidden mt-3 space-y-2" data-testid="decoder-full-cards">
                            {items.map((li, i) => {
                                const cancelled = !!li.is_cancellation;
                                const flag = li.flags_in_original || li.provider_notes;
                                return (
                                    <div key={i} className={`rounded-xl border p-3 ${flag ? "border-terracotta/40 bg-terracotta/5" : "border-kindred bg-surface"} ${cancelled ? "opacity-70" : ""}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <span className={`text-primary-k font-medium text-sm min-w-0 ${cancelled ? "italic" : ""}`}>{li.service_description || "—"}</span>
                                            <span className={`flex-none text-primary-k font-semibold tabular-nums text-sm ${cancelled ? "line-through" : ""}`}>{aud(li.gross)}</span>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-k">
                                            <span className="tabular-nums">{formatDate(li.date) || "—"}</span>
                                            <span>{STREAM_LABEL[li.stream] || li.stream || "—"}</span>
                                            {formatQtyUnit(li) && <span className="tabular-nums">{formatQtyUnit(li)}{li.unit_rate ? ` · ${aud(li.unit_rate)}` : ""}</span>}
                                            <span>Your share <span className="text-primary-k tabular-nums">{aud(li.participant_contribution)}</span></span>
                                            <span>Gov <span className="text-primary-k tabular-nums">{aud(li.government_paid)}</span></span>
                                        </div>
                                        {flag && (
                                            <div className="mt-1.5 inline-flex items-start gap-1 text-terracotta text-xs">
                                                <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" /><span>{flag}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {/* Desktop: table */}
                        <div className="hidden md:block mt-3 overflow-x-auto bg-surface border border-kindred rounded-xl">
                            <table className="min-w-full text-xs">
                                <thead className="bg-surface-2">
                                    <tr className="text-left text-muted-k uppercase tracking-wider text-[10px]">
                                        <th className="p-2.5">Date</th>
                                        <th className="p-2.5">Service</th>
                                        <th className="p-2.5">Code</th>
                                        <th className="p-2.5">Stream</th>
                                        <th className="p-2.5 text-right">Qty · Unit</th>
                                        <th className="p-2.5 text-right">Rate</th>
                                        <th className="p-2.5 text-right">Gross</th>
                                        <th className="p-2.5 text-right">Your share</th>
                                        <th className="p-2.5 text-right">Gov share</th>
                                        <th className="p-2.5">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-kindred">
                                    {items.map((li, i) => {
                                        const cancelled = !!li.is_cancellation;
                                        const flag = li.flags_in_original || li.provider_notes;
                                        return (
                                            <tr key={i} className={cancelled ? "text-muted-k italic" : "text-primary-k"}>
                                                <td className="p-2.5 tabular-nums whitespace-nowrap">{formatDate(li.date) || "—"}</td>
                                                <td className="p-2.5">{li.service_description || "—"}</td>
                                                <td className="p-2.5 tabular-nums">{li.service_code || "—"}</td>
                                                <td className="p-2.5">{STREAM_LABEL[li.stream] || li.stream || "—"}</td>
                                                <td className="p-2.5 text-right tabular-nums whitespace-nowrap">{formatQtyUnit(li) || "—"}</td>
                                                <td className="p-2.5 text-right tabular-nums">{li.unit_rate ? aud(li.unit_rate) : "—"}</td>
                                                <td className={`p-2.5 text-right tabular-nums ${cancelled ? "line-through" : ""}`}>{aud(li.gross)}</td>
                                                <td className="p-2.5 text-right tabular-nums">{aud(li.participant_contribution)}</td>
                                                <td className="p-2.5 text-right tabular-nums">{aud(li.government_paid)}</td>
                                                <td className="p-2.5">
                                                    {flag && (
                                                        <span className="inline-flex items-center gap-1 text-terracotta" title={flag}>
                                                            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate max-w-[200px]">{flag}</span>
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </section>
            )}
            {personaCopy.adm_disclosure && (
                <section
                    className="rounded-xl border border-kindred bg-surface-2 p-4 text-xs text-muted-k leading-relaxed"
                    data-testid="decoder-adm-disclosure"
                    aria-label="Automated decision-making disclosure"
                >
                    {personaCopy.adm_disclosure}
                </section>
            )}
        </div>
    );
}

const METHOD_LABELS = {
    text_paste: "Pasted text",
    text_file: "Text file",
    word_document: "Word document",
    pdf_text: "PDF (text)",
    pdf_scanned: "PDF (scanned)",
    image_vision: "Photo",
    email_attachment: "Email attachment",
};

function InputMethodBadge({ method }) {
    if (!method) return null;
    const label = METHOD_LABELS[method] || method;
    return (
        <span
            className="absolute top-4 right-4 inline-flex items-center bg-gold/20 text-gold border border-gold/40 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider"
            data-testid="decoder-input-method-badge"
            title={`Decoded from ${label}`}
        >
            From {label}
        </span>
    );
}

function InputMethodAccuracyNote({ method, parsingWarnings }) {
    if (!method) return null;
    let body = null;
    if (method === "image_vision" || method === "pdf_scanned") {
        body = "This statement was read from a photograph or scanned document. Image-based processing is less accurate than text-based processing. Dollar figures in particular should be carefully verified against your original statement, the AI can misread shadows, low-contrast figures, or unusual fonts.";
    } else if (method === "word_document") {
        body = "This statement was read from a Word document. Table formatting in Word files can sometimes cause data to be extracted in the wrong order. Verify line items against the original document if anything looks out of place.";
    }
    if (!body && !(parsingWarnings && parsingWarnings.length)) return null;
    return (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm text-primary-k space-y-2" data-testid="decoder-format-disclaimer">
            {body && <p>{body}</p>}
            {parsingWarnings && parsingWarnings.length > 0 && (
                <ul className="text-xs text-muted-k list-disc pl-4">
                    {parsingWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
            )}
        </div>
    );
}


// DEC-1 v7.7 Batch B, Balance panel component. Shows opening balance,
// quarterly allocation, closing balance, and rollover context so the ledger
// continuity across monthly and quarterly statements is visible. Renders
// only when the extraction supplies at least one balance field.
function BalancePanel({ extracted, summary, audit }) {
    // Pull balance-related fields from extracted (many possible key names
    // depending on the source layout). Falls back to summary values.
    const src = extracted || {};
    const sum = summary || {};

    const opening =
        src.opening_balance ??
        src.rollover_from_prior_quarter ??
        src.unused_funding_rolled_over ??
        sum.rollover_applied ??
        null;
    const allocation =
        src.quarterly_allocation_received ??
        src.quarterly_subsidy_this_period ??
        src.quarterly_budget_total ??
        null;
    const closing =
        src.closing_balance ??
        src.budget_remaining_at_quarter_end ??
        src.remaining_quarterly_budget ??
        sum.adjusted_budget_remaining ??
        sum.budget_remaining ??
        null;

    // Only render if at least two of the three fields are known, otherwise
    // the "budget remaining" tile in the main banner already covers it.
    const known = [opening, allocation, closing].filter(v => v !== null && v !== undefined && v !== "").length;
    if (known < 2) return null;

    const fmt = (v) => {
        if (v == null || v === "") return "—";
        const n = typeof v === "string" ? parseFloat(v.replace(/[$,]/g, "")) : v;
        if (isNaN(n)) return String(v);
        return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(n);
    };

    return (
        <section className="rounded-2xl border border-kindred sect-sage p-5" data-testid="decoder-balance-panel">
            <h3 className="text-xs uppercase tracking-wider text-muted-k mb-3">Budget continuity</h3>
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-k">Opening balance</div>
                    <div className="text-lg font-heading tabular-nums text-primary-k mt-1" data-testid="decoder-opening-balance">
                        {fmt(opening)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-k">Quarterly allocation</div>
                    <div className="text-lg font-heading tabular-nums text-primary-k mt-1" data-testid="decoder-allocation">
                        {fmt(allocation)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-k">Closing balance</div>
                    <div className="text-lg font-heading tabular-nums text-primary-k mt-1" data-testid="decoder-closing-balance">
                        {fmt(closing)}
                    </div>
                </div>
            </div>
        </section>
    );
}


// DEC-1 publish gate panel. Shown at the very top when the backend marks the
// statement unpublishable (its own numbers contradict each other). Presents
// the blocker findings prominently and replaces the trusted-summary banner.
// Fix-It Checklist: each blocker offers a one-tap "email my provider" letter.
function PublishBlockPanel({ block, message, blockers = [], onDraftLetter, onDraftAll }) {
    const [draftKey, setDraftKey] = useState(null);
    const [bundleBusy, setBundleBusy] = useState(false);
    const fallbackItems = Array.isArray(block?.items)
        ? block.items.filter((it) => it && (it.headline || it.detail))
        : [];
    // Prefer the full anomaly objects (they carry suggested_action + evidence
    // for a better letter); fall back to the lightweight {headline,detail} items.
    const rows = blockers.length > 0 ? blockers : fallbackItems;
    const reason = block?.reason
        || "This statement's own numbers do not reconcile, so a plain-English summary could be misleading.";

    const runDraft = onDraftLetter
        ? async (anom, key) => {
            setDraftKey(key);
            try { await onDraftLetter(anom); } finally { setDraftKey(null); }
        }
        : null;
    // Blocker Letters Bundle: one email raising every blocker at once.
    const runBundle = (onDraftAll && blockers.length > 1)
        ? async () => { setBundleBusy(true); try { await onDraftAll(blockers); } finally { setBundleBusy(false); } }
        : null;

    return (
        <section
            className="rounded-2xl border-2 border-terracotta bg-terracotta/5 p-6"
            data-testid="decoder-publish-block"
            role="alert"
        >
            <div className="flex items-start gap-3">
                <span className="h-9 w-9 rounded-full bg-terracotta text-white flex items-center justify-center flex-shrink-0">
                    <AlertOctagon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h2 className="font-heading text-xl md:text-2xl text-primary-k tracking-tight" data-testid="decoder-publish-block-title">
                        We can&apos;t publish a trustworthy summary of this statement yet
                    </h2>
                    <p className="mt-1.5 text-sm text-primary-k/80 leading-relaxed">{reason}</p>
                </div>
            </div>

            {runBundle && (
                <button
                    type="button"
                    onClick={runBundle}
                    disabled={bundleBusy}
                    data-testid="decoder-publish-block-email-all"
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-k text-white text-sm font-semibold px-4 py-3 hover:bg-[#091D33] disabled:opacity-60 transition-colors"
                >
                    <PenLine className="h-4 w-4" />
                    {bundleBusy ? "Starting email\u2026" : `Draft one email to your provider covering all ${blockers.length} blockers`}
                </button>
            )}

            {rows.length > 0 ? (
                <ul className="mt-4 space-y-2" data-testid="decoder-publish-block-items">
                    {rows.map((it, i) => {
                        const headline = it.headline || it.title;
                        const evidence = Array.isArray(it.evidence)
                            ? it.evidence.filter((e) => typeof e === "string" && e.trim())
                            : [];
                        const canDraft = runDraft && blockers.length > 0;
                        return (
                            <li
                                key={i}
                                className="rounded-lg bg-surface border border-terracotta/30 p-3"
                                data-testid={`decoder-publish-block-item-${i}`}
                            >
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 text-terracotta flex-shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-primary-k">{headline}</div>
                                        {it.detail && <div className="text-xs text-muted-k mt-0.5 leading-relaxed">{it.detail}</div>}
                                        {evidence.length > 0 && (
                                            <div className="mt-2 rounded-md bg-surface-2 border border-kindred px-2.5 py-2" data-testid={`decoder-publish-block-evidence-${i}`}>
                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-k mb-1 flex items-center gap-1.5">
                                                    <FileText className="h-3 w-3" /> From your statement
                                                </div>
                                                <ul className="space-y-0.5">
                                                    {evidence.map((e, j) => (
                                                        <li key={j} className="text-[12px] text-primary-k/90 leading-snug tabular-nums">{e}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {canDraft && (
                                            <button
                                                type="button"
                                                onClick={() => runDraft(it, i)}
                                                disabled={draftKey === i}
                                                data-testid={`decoder-publish-block-email-${i}`}
                                                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white text-[12px] font-semibold px-3.5 py-1.5 hover:bg-[#091D33] disabled:opacity-60 transition-colors"
                                            >
                                                <PenLine className="h-3.5 w-3.5" />
                                                {draftKey === i ? "Starting email\u2026" : "Email my provider about this"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                message && (
                    <p className="mt-4 text-sm text-primary-k whitespace-pre-line" data-testid="decoder-publish-block-message">
                        {message}
                    </p>
                )
            )}
            <p className="mt-4 text-xs text-muted-k leading-relaxed">
                The full checks are listed below. Once the provider corrects these figures or confirms them, re-run the statement and we&apos;ll produce the complete plain-English breakdown.
            </p>
        </section>
    );
}

// Shown when the extractor's per-line confidence dropped below the DEC-1
// threshold, so the reader treats the decoded figures with extra caution.
function LowConfidenceBanner({ confidence }) {
    const pct = (typeof confidence === "number") ? Math.round(confidence * 100) : null;
    return (
        <div
            className="rounded-lg border border-gold/50 bg-gold/10 p-4 flex items-start gap-3"
            data-testid="decoder-low-confidence-banner"
        >
            <Info className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" />
            <div className="text-sm text-primary-k">
                <span className="font-medium">Some figures were hard to read.</span>{" "}
                Parts of this statement decoded with low confidence{pct != null ? ` (around ${pct}%)` : ""}, so please double-check the amounts against your original statement.
            </div>
        </div>
    );
}

// DOC-PARITY-1 decision 7: a collapsible severity-band section. Defaults to
// EXPANDED; the user can collapse a band to hide its findings.
function SeverityGroup({ band, items, onDraftLetter }) {
    const [open, setOpen] = useState(true);
    const [draftKey, setDraftKey] = useState(null);
    const meta = SEV_META[band] || SEV_META.low;
    const runDraft = onDraftLetter
        ? async (a, key) => { setDraftKey(key); try { await onDraftLetter(a); } finally { setDraftKey(null); } }
        : null;
    return (
        <div className="mt-4" data-testid={`severity-group-${band}`}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-surface-2 border border-kindred hover:bg-surface transition-colors"
                data-testid={`severity-group-toggle-${band}`}
            >
                <span className="flex items-center gap-2">
                    <span className={`h-6 w-6 rounded-full ${meta.bg} ${meta.fg} flex items-center justify-center flex-shrink-0`}>
                        <meta.Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-medium text-primary-k text-sm">{BAND_HEADER[band]}</span>
                    <span className="text-xs text-muted-k">({items.length})</span>
                </span>
                {open ? <ChevronUp className="h-4 w-4 text-muted-k" /> : <ChevronDown className="h-4 w-4 text-muted-k" />}
            </button>
            {open && (
                <ul className="mt-3 space-y-3" data-testid={`severity-group-items-${band}`}>
                    {items.map((a, i) => (
                        <FlagCard
                            key={i}
                            idx={i}
                            severity={band === "informational" ? "low" : band}
                            title={a.headline}
                            detail={a.detail}
                            action={a.suggested_action}
                            evidence={a.evidence}
                            dollarImpact={a.dollar_impact}
                            onDraftLetter={runDraft ? () => runDraft(a, `${band}-${i}`) : undefined}
                            draftBusy={draftKey === `${band}-${i}`}
                            testId={`anomaly-card-${i}`}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
