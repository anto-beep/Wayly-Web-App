import React, { useMemo } from "react";
import { TrendingUp, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { formatAUD2 } from "@/lib/api";

/**
 * DashboardInsights
 * Two compact visualisations for the caregiver dashboard:
 *   1. Monthly burn-rate sparkline (gross + co-payment, last 6 months)
 *   2. Anomaly severity timeline (one column per statement, last 8)
 *
 * Renders nothing if there are no statements yet.
 */

export default function DashboardInsights({ statements }) {
    const burnSeries = useMemo(() => buildBurnSeries(statements), [statements]);
    const anomalyStrip = useMemo(() => buildAnomalyStrip(statements), [statements]);

    if (!statements || statements.length === 0) return null;

    return (
        <div className="grid lg:grid-cols-2 gap-4 md:gap-6" data-testid="dashboard-insights">
            <BurnRateChart series={burnSeries} />
            <AnomalyTimeline data={anomalyStrip} />
        </div>
    );
}

/* ---------- Burn rate sparkline ---------- */
function BurnRateChart({ series }) {
    if (!series.length) return null;
    const maxGross = Math.max(...series.map((p) => p.gross), 1);

    return (
        <div className="bg-surface border border-kindred rounded-xl p-5 md:p-6" data-testid="burn-rate-chart">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-muted-k">
                        <TrendingUp className="h-4 w-4" />
                        <span className="overline">Monthly spend</span>
                    </div>
                    <div className="mt-1 font-heading text-xl text-primary-k">
                        Last {series.length} {series.length === 1 ? "month" : "months"}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-muted-k">Last month gross</div>
                    <div className="font-heading text-lg text-primary-k tabular-nums">{formatAUD2(series[series.length - 1].gross)}</div>
                </div>
            </div>
            <div className="mt-5 flex items-end gap-1.5 md:gap-2 h-32" aria-label="Monthly gross spend">
                {series.map((p) => {
                    const heightPct = Math.max(4, (p.gross / maxGross) * 100);
                    return (
                        <div key={p.label} className="flex-1 flex flex-col items-center gap-1.5 group">
                            <div className="text-[10px] text-muted-k tabular-nums opacity-70 group-hover:opacity-100">
                                {formatShort(p.gross)}
                            </div>
                            <div
                                className="w-full bg-primary-k rounded-t-md transition-all group-hover:bg-[#16294a]"
                                style={{ height: `${heightPct}%` }}
                                title={`${p.label}: ${formatAUD2(p.gross)} gross, ${formatAUD2(p.copay)} co-payment`}
                            />
                            <div className="text-[10px] text-muted-k whitespace-nowrap">{p.label}</div>
                        </div>
                    );
                })}
            </div>
            <p className="text-xs text-muted-k mt-3">
                Hover bars for the gross + co-payment breakdown. We compute these from your line items, regardless of period label.
            </p>
        </div>
    );
}

/* ---------- Anomaly severity timeline ---------- */
function AnomalyTimeline({ data }) {
    if (!data.length) return null;
    const totalAlerts = data.reduce((acc, d) => acc + d.alerts, 0);
    const totalWarns = data.reduce((acc, d) => acc + d.warns, 0);
    const totalInfos = data.reduce((acc, d) => acc + d.infos, 0);

    return (
        <div className="bg-surface border border-kindred rounded-xl p-5 md:p-6" data-testid="anomaly-timeline">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-muted-k">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="overline">Anomalies over time</span>
                    </div>
                    <div className="mt-1 font-heading text-xl text-primary-k">Last {data.length} {data.length === 1 ? "statement" : "statements"}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-xs">
                    <span className="inline-flex items-center gap-1 text-terracotta">
                        <span className="w-2 h-2 rounded-full bg-terracotta" /> {totalAlerts} alert{totalAlerts === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-gold-700">
                        <span className="w-2 h-2 rounded-full bg-gold" /> {totalWarns} warn
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-k">
                        <span className="w-2 h-2 rounded-full bg-sage" /> {totalInfos} info
                    </span>
                </div>
            </div>
            <div className="mt-5 flex items-end gap-1.5 md:gap-2 h-32 overflow-x-auto no-scrollbar" aria-label="Anomaly counts per statement">
                {data.map((d) => {
                    const total = d.alerts + d.warns + d.infos;
                    const max = Math.max(...data.map((x) => x.alerts + x.warns + x.infos), 1);
                    const colHeight = Math.max(8, (total / max) * 100);
                    return (
                        <div key={d.id} className="flex-1 min-w-[28px] flex flex-col items-center gap-1.5 group">
                            <div className="text-[10px] text-muted-k tabular-nums opacity-70 group-hover:opacity-100">
                                {total || ""}
                            </div>
                            <div
                                className="w-full rounded-t-md overflow-hidden flex flex-col-reverse"
                                style={{ height: `${colHeight}%`, minHeight: total ? "8px" : "2px" }}
                                title={`${d.label}: ${d.alerts} alert${d.alerts === 1 ? "" : "s"}, ${d.warns} warn, ${d.infos} info`}
                            >
                                {total === 0 ? (
                                    <div className="w-full h-full bg-sage/40" />
                                ) : (
                                    <>
                                        {d.alerts > 0 && (
                                            <div
                                                className="bg-terracotta"
                                                style={{ flex: d.alerts }}
                                            />
                                        )}
                                        {d.warns > 0 && (
                                            <div
                                                className="bg-gold"
                                                style={{ flex: d.warns }}
                                            />
                                        )}
                                        {d.infos > 0 && (
                                            <div
                                                className="bg-sage"
                                                style={{ flex: d.infos }}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="text-[10px] text-muted-k whitespace-nowrap">{d.label}</div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-muted-k">
                <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-terracotta" /> Alert = action recommended
                </div>
                <div className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-gold" /> Warning = check it
                </div>
                <div className="flex items-center gap-1">
                    <Info className="h-3 w-3 text-sage" /> Info = FYI only
                </div>
            </div>
        </div>
    );
}

/* ---------- helpers ---------- */
function buildBurnSeries(statements) {
    if (!statements?.length) return [];
    const sorted = [...statements].sort((a, b) => new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0));
    return sorted.slice(-6).map((s) => {
        const gross = (s.line_items || []).reduce((sum, li) => sum + (li.total || 0), 0);
        const copay = (s.line_items || []).reduce((sum, li) => sum + (li.copayment || li.copay || 0), 0);
        return {
            label: shortPeriod(s.period_label || s.filename || s.uploaded_at),
            gross: Math.round(gross),
            copay: Math.round(copay),
        };
    });
}

function buildAnomalyStrip(statements) {
    if (!statements?.length) return [];
    const sorted = [...statements].sort((a, b) => new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0));
    return sorted.slice(-8).map((s) => {
        const an = s.anomalies || [];
        const sevCounts = an.reduce((acc, a) => {
            const sev = (a.severity || "").toLowerCase();
            acc[sev === "alert" ? "alerts" : sev === "warning" ? "warns" : "infos"]++;
            return acc;
        }, { alerts: 0, warns: 0, infos: 0 });
        return {
            id: s.id,
            label: shortPeriod(s.period_label || s.filename || s.uploaded_at),
            ...sevCounts,
        };
    });
}

function shortPeriod(s) {
    if (!s) return "—";
    // Try to pull "May 2026" → "May" or "2026-04" → "Apr"
    const m = String(s).match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (m) return m[0][0].toUpperCase() + m[0].slice(1, 3).toLowerCase();
    // Date-like
    try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toLocaleString("en-AU", { month: "short" });
    } catch {}
    return String(s).slice(0, 6);
}

function formatShort(n) {
    if (!n) return "$0";
    if (n >= 1000) return `$${Math.round(n / 100) / 10}k`;
    return `$${n}`;
}
