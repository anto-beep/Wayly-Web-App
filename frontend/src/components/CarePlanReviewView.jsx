import React, { useState } from "react";
import { Sparkles, Download, ShieldAlert, ShieldCheck, AlertOctagon, Shield, ChevronDown, Loader2 } from "lucide-react";

// Findings: urgent first. compliance → warning/other → info. (Mirrors the
// tool page so a saved entry renders identically to the initial run.)
function cpSeverityRank(f) {
    const s = (f?.severity || "").toLowerCase();
    if (s === "compliance") return 0;
    if (s === "info") return 2;
    return 1;
}
function cpSeverityMeta(f) {
    const s = (f?.severity || "").toLowerCase();
    if (s === "compliance") return { color: "#B23A2E", tint: "rgba(178,58,46,0.08)", Icon: AlertOctagon, label: "Needs attention" };
    if (s === "info") return { color: "#0E4D52", tint: "rgba(14,77,82,0.08)", Icon: Shield, label: "Good to know" };
    return { color: "#A5512B", tint: "rgba(165,81,43,0.08)", Icon: ShieldAlert, label: "Worth checking" };
}
const _money = (v) => Number(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Read-only presentation of a care-plan review — the Wayly Summary, the
 * "What we found" findings, and the Safety checks panel — shared by the tool
 * result screen and the saved Care Plans entry so both look the same.
 */
export default function CarePlanReviewView({
    planSummary,
    findings = [],
    verificationPanel,
    extraction = {},
    safetyNotice,
    onDownload,
    downloadBusy = false,
}) {
    const [openFinding, setOpenFinding] = useState(null);
    const vp = verificationPanel || {};
    const ext = extraction || {};
    const fs = findings || [];

    return (
        <div className="space-y-5" data-testid="cp-review-view">
            {/* Wayly Summary */}
            <div className="panel-solid-teal rounded-2xl p-6" data-testid="cp-plan-summary">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-white/80">
                        <Sparkles className="h-4 w-4" /> Wayly Summary
                    </div>
                    {onDownload && (
                        <button
                            onClick={onDownload}
                            disabled={downloadBusy}
                            data-testid="cp-download-summary"
                            className="inline-flex items-center gap-1.5 text-xs bg-white text-[#0E4D52] rounded-full px-3 py-1.5 font-semibold hover:bg-white/90 disabled:opacity-60"
                        >
                            {downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {downloadBusy ? "Preparing…" : "Download summary"}
                        </button>
                    )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {ext.provider_name && (
                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">Provider: {ext.provider_name}</span>
                    )}
                    {ext.classification && (
                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">Level {ext.classification}</span>
                    )}
                    {(() => {
                        const val = vp.classification_quarterly_budget ?? ext.quarterly_budget;
                        if (!val) return null;
                        return <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">${_money(val)} / quarter</span>;
                    })()}
                    {(ext.services || []).length > 0 && (
                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">{ext.services.length} service{ext.services.length === 1 ? "" : "s"}</span>
                    )}
                </div>
                {planSummary && <p className="mt-3 text-sm text-white/95 leading-relaxed">{planSummary}</p>}
            </div>

            {/* Findings — urgent first, colour-coded */}
            <div className="rounded-2xl bg-surface border border-kindred p-6" data-testid="cp-file-findings">
                <div>
                    <div className="overline">What we found</div>
                    <p className="text-sm text-muted-k mt-0.5">The most important things to look at, most urgent first.</p>
                </div>
                {fs.length > 0 && (() => {
                    const urgent = fs.filter((f) => cpSeverityRank(f) === 0).length;
                    const check = fs.filter((f) => cpSeverityRank(f) === 1).length;
                    const info = fs.filter((f) => cpSeverityRank(f) === 2).length;
                    const Chip = ({ n, color, label }) => n > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px]">{n}</span>{label}
                        </span>
                    ) : null;
                    return (
                        <div className="mt-3 flex flex-wrap gap-2" data-testid="cp-findings-tally">
                            <Chip n={urgent} color="#B23A2E" label="Need attention" />
                            <Chip n={check} color="#A5512B" label="Worth checking" />
                            <Chip n={info} color="#0E4D52" label="Good to know" />
                        </div>
                    );
                })()}
                {safetyNotice && (
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-300 p-3" data-testid="cp-safety-banner">
                        <div className="text-sm font-semibold text-amber-900">{safetyNotice.title}</div>
                        <p className="text-xs text-amber-900 mt-1 leading-relaxed">{safetyNotice.body}</p>
                    </div>
                )}
                {fs.length === 0 ? (
                    <div className="mt-4 rounded-xl panel-solid-sage p-5 text-white" data-testid="cp-no-findings">
                        <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" /> Nothing needs your attention</div>
                        <p className="text-sm text-white/90 mt-1">We ran every check and did not spot any issues in this plan. That is good news.</p>
                    </div>
                ) : (
                    <ul className="mt-4 space-y-2.5">
                        {[...fs]
                            .map((f, i) => ({ f, i }))
                            .sort((a, b) => cpSeverityRank(a.f) - cpSeverityRank(b.f))
                            .map(({ f, i }) => {
                                const m = cpSeverityMeta(f);
                                const Icon = m.Icon;
                                const open = openFinding === i;
                                return (
                                    <li key={i} className="rounded-2xl bg-surface border border-kindred overflow-hidden" style={{ borderLeft: `4px solid ${m.color}` }} data-testid={`cp-finding-${i}`}>
                                        <button
                                            onClick={() => setOpenFinding(open ? null : i)}
                                            className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-2 transition-colors"
                                            data-testid={`cp-finding-toggle-${i}`}
                                            aria-expanded={open}
                                        >
                                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: m.color }}>
                                                <Icon className="h-4 w-4 text-white" />
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-[10px] uppercase tracking-wider font-semibold" style={{ color: m.color }}>{m.label}</span>
                                                <span className="block font-semibold text-primary-k leading-snug">{f.title}</span>
                                            </span>
                                            <ChevronDown className={`h-5 w-5 text-muted-k shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                                        </button>
                                        {open && (
                                            <div className="px-4 pb-4 sm:pl-16 space-y-3" data-testid={`cp-finding-body-${i}`}>
                                                <p className="text-sm text-primary-k leading-relaxed">{f.detail}</p>
                                                {f.suggested_question && (
                                                    <div className="rounded-lg p-3" style={{ backgroundColor: m.tint }}>
                                                        <div className="text-[10px] uppercase tracking-wider text-muted-k">What to ask your provider</div>
                                                        <p className="text-sm text-primary-k mt-0.5">{f.suggested_question}</p>
                                                    </div>
                                                )}
                                                {f.citation_source && (
                                                    <div className="text-[11px] text-muted-k">From the plan: {f.citation_source}</div>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                    </ul>
                )}
            </div>

            {/* Safety checks we ran */}
            {vp.checks?.length > 0 && (
                <div className="rounded-2xl bg-surface border border-kindred p-6" data-testid="cp-verification-panel">
                    <div className="overline">Safety checks we ran</div>
                    <p className="mt-1 text-sm text-muted-k">Five Support at Home checks we run on every plan. A tick means we confirmed it, not just that nothing was said.</p>
                    <div className="mt-4 grid sm:grid-cols-2 gap-3">
                        {vp.checks.map((c) => {
                            const meta = {
                                pass: { panel: "panel-solid-sage", Icon: ShieldCheck, label: "All good" },
                                flag: { panel: "panel-solid-clay", Icon: AlertOctagon, label: "Worth a look" },
                                cannot_run: { panel: "bg-surface-2 border border-kindred", Icon: ShieldAlert, label: "Need more info", dark: true },
                            }[c.status] || { panel: "bg-surface-2 border border-kindred", Icon: ShieldAlert, label: c.status, dark: true };
                            const Icon = meta.Icon;
                            return (
                                <div key={c.check} data-testid={`cp-check-${c.check}`} className={`rounded-xl p-4 ${meta.panel} ${meta.dark ? "" : "text-white"}`}>
                                    <div className="flex items-center gap-2">
                                        <Icon className={`h-4 w-4 shrink-0 ${meta.dark ? "text-gold" : "text-white"}`} />
                                        <span className={`text-sm font-semibold ${meta.dark ? "text-primary-k" : "text-white"}`}>{c.label}</span>
                                        <span className={`ml-auto text-[9px] uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.dark ? "bg-amber-100 text-primary-k" : "bg-white/20 text-white"}`}>{meta.label}</span>
                                    </div>
                                    <p className={`text-xs mt-1.5 leading-relaxed ${meta.dark ? "text-muted-k" : "text-white/90"}`}>{c.detail}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
