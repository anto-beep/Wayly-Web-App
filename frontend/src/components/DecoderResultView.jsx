import React, { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Info, Shield, ShieldAlert, ShieldCheck, AlertOctagon } from "lucide-react";

function aud(n) {
    if (n == null) return "—";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}
const SEV_META = {
    high:   { label: "High",   bg: "bg-terracotta",  fg: "text-white", Icon: AlertOctagon },
    medium: { label: "Medium", bg: "bg-gold",        fg: "text-primary-k", Icon: ShieldAlert },
    low:    { label: "Low",    bg: "bg-sage",        fg: "text-white", Icon: Shield },
};
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
export default function DecoderResultView({ result }) {
    const audit = result.audit || {};
    const extracted = result.extracted || {};
    const summary = audit.statement_summary || {};
    const anoms = audit.anomalies || [];
    const counts = audit.anomaly_count || { high: 0, medium: 0, low: 0 };
    const streams = audit.stream_breakdown || [];
    const items = extracted.line_items || [];

    const [openStreams, setOpenStreams] = useState({});
    const [showTable, setShowTable] = useState(false);

    const toggleStream = (s) => setOpenStreams((p) => ({ ...p, [s]: !p[s] }));

    const topBanner = counts.high > 0
        ? { cls: "bg-terracotta text-white border-terracotta", Icon: AlertOctagon, text: `${counts.high} high-priority thing${counts.high === 1 ? "" : "s"} to review.` }
        : counts.medium > 0
        ? { cls: "bg-gold/20 text-primary-k border-gold", Icon: ShieldAlert, text: `${counts.medium} thing${counts.medium === 1 ? "" : "s"} worth a closer look.` }
        : counts.low > 0
        ? { cls: "bg-sage/15 text-[#3A5A40] border-sage", Icon: Info, text: `${counts.low} small note${counts.low === 1 ? "" : "s"} — mostly informational.` }
        : { cls: "bg-sage/15 text-[#3A5A40] border-sage", Icon: ShieldCheck, text: "Statement looks clean. Nothing unusual found. ✓" };

    return (
        <div className="space-y-6" data-testid="decoder-result-v2">
            {result.partial_result && (
                <div className="bg-gold/15 border border-gold/40 rounded-lg p-4 text-sm text-primary-k" data-testid="decoder-partial-warning">
                    <div className="font-medium">Partial result</div>
                    We had trouble reading parts of this statement. Here's what we could extract — a Kindred team member will review the rest within a few hours.
                </div>
            )}

            {/* SECTION 1 — Summary banner */}
            <section className="bg-primary-k text-white rounded-2xl p-6" data-testid="decoder-summary-banner">
                <div className="text-[11px] uppercase tracking-[0.18em] text-gold">
                    {summary.period || "Statement"}
                    {summary.participant_name ? ` · ${summary.participant_name}` : ""}
                    {summary.classification ? ` · ${summary.classification}` : ""}
                    {summary.provider ? ` · ${summary.provider}` : ""}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Gross billed</div>
                        <div className="font-heading text-2xl mt-1 tabular-nums">{aud(summary.total_gross)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Your contribution</div>
                        <div className="font-heading text-2xl mt-1 tabular-nums text-gold">{aud(summary.total_participant_contribution)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Government paid</div>
                        <div className="font-heading text-2xl mt-1 tabular-nums">{aud(summary.total_government_paid)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-white/70">Budget remaining</div>
                        <div className="font-heading text-2xl mt-1 tabular-nums">{aud(summary.adjusted_budget_remaining ?? summary.budget_remaining)}</div>
                    </div>
                </div>
                {(summary.care_management_fee || summary.rollover_applied || summary.lifetime_cap_remaining != null) && (
                    <div className="mt-4 pt-4 border-t border-white/15 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-white/70">
                        {summary.care_management_fee ? <span>Care management fee {aud(summary.care_management_fee)}</span> : null}
                        {summary.rollover_applied ? <span>Rollover applied {aud(summary.rollover_applied)}</span> : null}
                        {summary.lifetime_cap_remaining != null ? <span>Lifetime cap remaining {aud(summary.lifetime_cap_remaining)}</span> : null}
                    </div>
                )}
            </section>

            {/* SECTION 2 — Anomaly alert panel (always shown) */}
            <section data-testid="decoder-anomaly-panel">
                <div className={`border-l-4 rounded-r-lg p-4 flex items-start gap-3 ${topBanner.cls}`} data-testid="anomaly-top-banner">
                    <topBanner.Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="text-sm font-medium">{topBanner.text}</div>
                </div>

                {anoms.length > 0 && (
                    <ul className="mt-4 space-y-3">
                        {anoms.map((a, i) => {
                            const meta = SEV_META[(a.severity || "low").toLowerCase()] || SEV_META.low;
                            return (
                                <li key={i} className="bg-surface border border-kindred rounded-xl p-5" data-testid={`anomaly-card-${i}`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`h-9 w-9 rounded-full ${meta.bg} ${meta.fg} flex items-center justify-center flex-shrink-0`}>
                                            <meta.Icon className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.bg} ${meta.fg}`}>
                                                    {meta.label}
                                                </span>
                                                <span className="text-[10px] text-muted-k uppercase tracking-wider">{(a.rule || "").replace(/^RULE_/, "R").replace(/_/g, " ")}</span>
                                            </div>
                                            <div className="mt-2 font-medium text-primary-k">{a.headline}</div>
                                            {a.detail && <p className="text-sm text-muted-k mt-1.5 leading-relaxed">{a.detail}</p>}
                                            {a.dollar_impact > 0 && (
                                                <div className="mt-2 text-sm text-primary-k">
                                                    Potential impact: <span className="font-semibold tabular-nums">{aud(a.dollar_impact)}</span>
                                                </div>
                                            )}
                                            {Array.isArray(a.evidence) && a.evidence.length > 0 && (
                                                <ul className="mt-2 space-y-1">
                                                    {a.evidence.map((e, j) => (
                                                        <li key={j} className="text-xs text-muted-k flex items-start gap-1.5">
                                                            <span className="text-gold">▸</span><span>{e}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {a.suggested_action && (
                                                <div className="mt-3 text-sm font-medium text-primary-k">
                                                    → {a.suggested_action}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* SECTION 3 — Stream breakdown */}
            {streams.length > 0 && (
                <section data-testid="decoder-stream-breakdown">
                    <div className="overline mb-3">Stream breakdown</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {streams.map((s) => {
                            const isOpen = !!openStreams[s.stream];
                            const itemsInStream = items.filter((li) => li.stream === s.stream && !li.is_cancellation);
                            return (
                                <div key={s.stream} className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid={`stream-card-${s.stream}`}>
                                    <button
                                        type="button"
                                        onClick={() => toggleStream(s.stream)}
                                        className="w-full text-left p-4 hover:bg-surface-2 transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-k">{STREAM_LABEL[s.stream] || s.stream}</span>
                                            {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-k" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-k" />}
                                        </div>
                                        <div className="mt-1.5 font-heading text-xl text-primary-k tabular-nums">{aud(s.gross_total)}</div>
                                        <div className="text-[11px] text-muted-k mt-0.5">{s.line_item_count} item{s.line_item_count === 1 ? "" : "s"} · you paid <span className="font-medium text-primary-k">{aud(s.participant_contribution)}</span></div>
                                    </button>
                                    {isOpen && (
                                        <ul className="border-t border-kindred divide-y divide-kindred bg-surface-2">
                                            {itemsInStream.length === 0 ? (
                                                <li className="p-3 text-xs text-muted-k">No line items in this stream.</li>
                                            ) : itemsInStream.map((li, i) => (
                                                <li key={i} className="p-3 text-xs flex items-center justify-between gap-2">
                                                    <span className="text-primary-k truncate">{li.date?.slice(5) || "—"} · {li.service_description || "Service"}</span>
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

            {/* SECTION 4 — Full line-item table (collapsed by default) */}
            {items.length > 0 && (
                <section data-testid="decoder-full-table">
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
                        <div className="mt-3 overflow-x-auto bg-surface border border-kindred rounded-xl">
                            <table className="min-w-full text-xs">
                                <thead className="bg-surface-2">
                                    <tr className="text-left text-muted-k uppercase tracking-wider text-[10px]">
                                        <th className="p-2.5">Date</th>
                                        <th className="p-2.5">Service</th>
                                        <th className="p-2.5">Code</th>
                                        <th className="p-2.5">Stream</th>
                                        <th className="p-2.5 text-right">Hours</th>
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
                                                <td className="p-2.5 tabular-nums">{li.date || "—"}</td>
                                                <td className="p-2.5">{li.service_description || "—"}</td>
                                                <td className="p-2.5 tabular-nums">{li.service_code || "—"}</td>
                                                <td className="p-2.5">{STREAM_LABEL[li.stream] || li.stream || "—"}</td>
                                                <td className="p-2.5 text-right tabular-nums">{li.hours ? Number(li.hours).toFixed(2) : "—"}</td>
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
                    )}
                </section>
            )}
        </div>
    );
}
