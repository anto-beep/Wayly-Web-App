import React, { useMemo } from "react";
import { TrendingUp, AlertTriangle, AlertCircle, Info, Inbox } from "lucide-react";
import { formatAUD2 } from "@/lib/api";

/**
 * DashboardInsights
 * Two prominent visualisations for the caregiver dashboard:
 *   1. Monthly Spend bar chart, Teal-Ink primary series with Clay co-payment overlay
 *   2. Anomalies Over Time, stacked severity columns per statement (Clay alert / Gold warn / Sage info)
 *
 * Per UI-1 §2: bars are the dominant visual element, brand palette,
 * subtle gridlines, AAA contrast both modes, written empty states,
 * legend uses shape indicators not colour alone.
 */

const GRIDLINE_COUNT = 4;

export default function DashboardInsights({ statements }) {
    const burnSeries = useMemo(() => buildBurnSeries(statements), [statements]);
    const anomalyStrip = useMemo(() => buildAnomalyStrip(statements), [statements]);

    const hasData = statements && statements.length > 0;

    return (
        <div className="grid lg:grid-cols-2 gap-4 md:gap-6" data-testid="dashboard-insights">
            <BurnRateChart series={burnSeries} hasData={hasData} />
            <AnomalyTimeline data={anomalyStrip} hasData={hasData} />
        </div>
    );
}

/* ---------- Monthly Spend ---------- */
function BurnRateChart({ series, hasData }) {
    const isEmpty = !hasData || series.length === 0;
    const maxGross = isEmpty ? 1 : Math.max(...series.map((p) => p.gross), 1);
    const lastGross = isEmpty ? 0 : series[series.length - 1].gross;

    // Pleasant rounded ticks for the y-axis
    const yTicks = useMemo(() => buildTicks(maxGross), [maxGross]);

    return (
        <div
            className="bg-surface border border-kindred rounded-2xl p-5 md:p-6 shadow-sm"
            data-testid="burn-rate-chart"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-muted-k">
                        <TrendingUp className="h-4 w-4" />
                        <span className="overline">Monthly Spend</span>
                    </div>
                    <div className="mt-1 font-heading text-2xl text-primary-k">
                        {isEmpty ? "Once your first statement is decoded" : `Last ${series.length} ${series.length === 1 ? "month" : "months"}`}
                    </div>
                </div>
                {!isEmpty && (
                    <div className="text-right">
                        <div className="text-xs text-muted-k">Last month gross</div>
                        <div
                            className="font-heading text-2xl text-primary-k tabular-nums"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                            {formatAUD2(lastGross)}
                        </div>
                    </div>
                )}
            </div>

            {/* Legend with shape indicators (not colour alone) */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-k">
                <span className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden
                        className="inline-block w-3 h-3 rounded-sm bg-primary-k"
                    />
                    Gross billed
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span
                        aria-hidden
                        className="inline-block w-3 h-3 rounded-sm border-2 border-dashed"
                        style={{ borderColor: "var(--wayly-clay-500)", background: "transparent" }}
                    />
                    Co-payment
                </span>
            </div>

            {/* Chart area */}
            <div className="mt-4 relative" aria-label="Monthly gross spend">
                {isEmpty ? (
                    <EmptyChartState
                        height={280}
                        message="No data yet. Once your provider statement is decoded, monthly spending will appear here."
                    />
                ) : (
                    <>
                        {/* Gridlines + y-axis labels */}
                        <div className="relative" style={{ height: 280 }}>
                            {/* Y-axis tick labels */}
                            <div className="absolute inset-y-0 left-0 w-12 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((tick, i) => (
                                    <div
                                        key={`tick-${i}`}
                                        className="text-[11px] text-muted-k tabular-nums pr-2 text-right leading-none"
                                        style={{ fontVariantNumeric: "tabular-nums" }}
                                    >
                                        {tick === 0 ? "$0" : formatShort(tick)}
                                    </div>
                                ))}
                            </div>

                            {/* Gridlines */}
                            <div className="absolute inset-y-0 left-12 right-0 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((_, i) => (
                                    <div
                                        key={`grid-${i}`}
                                        className="w-full border-t"
                                        style={{ borderColor: "var(--kindred-border, rgba(14,77,82,0.18))" }}
                                    />
                                ))}
                            </div>

                            {/* Bars */}
                            <div className="absolute inset-y-0 left-12 right-0 flex items-end justify-around gap-3 md:gap-4 pb-0">
                                {series.map((p, idx) => {
                                    const heightPct = Math.max(2, (p.gross / maxGross) * 100);
                                    const copayPct = p.gross > 0 ? Math.min(100, (p.copay / p.gross) * 100) : 0;
                                    return (
                                        <div
                                            key={`${p.label}-${idx}`}
                                            className="flex-1 flex flex-col items-center gap-2 group h-full justify-end relative"
                                            data-testid={`burn-bar-${idx}`}
                                        >
                                            {/* Value above bar */}
                                            <div
                                                className="text-[12px] font-semibold text-primary-k tabular-nums whitespace-nowrap"
                                                style={{ fontVariantNumeric: "tabular-nums" }}
                                            >
                                                {formatShort(p.gross)}
                                            </div>

                                            {/* Bar */}
                                            <div
                                                className="w-full max-w-[64px] relative rounded-t-xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow"
                                                style={{ height: `${heightPct}%`, minHeight: "10px" }}
                                                title={`${p.label}: ${formatAUD2(p.gross)} gross · ${formatAUD2(p.copay)} co-payment`}
                                            >
                                                {/* Primary gross fill (Teal-Ink with subtle gradient) */}
                                                <div
                                                    className="absolute inset-0"
                                                    style={{
                                                        background:
                                                            "linear-gradient(180deg, var(--kindred-primary) 0%, var(--kindred-primary) 70%, rgba(14,77,82,0.92) 100%)",
                                                    }}
                                                />
                                                {/* Co-payment overlay (Clay) at bottom of bar */}
                                                {p.copay > 0 && (
                                                    <div
                                                        className="absolute bottom-0 left-0 right-0"
                                                        style={{
                                                            height: `${copayPct}%`,
                                                            background:
                                                                "repeating-linear-gradient(135deg, var(--wayly-clay-500) 0 6px, var(--wayly-clay-400) 6px 12px)",
                                                            opacity: 0.95,
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* X-axis labels */}
                        <div className="pl-12 mt-2 flex justify-around gap-3 md:gap-4">
                            {series.map((p, idx) => (
                                <div
                                    key={`xlabel-${idx}`}
                                    className="flex-1 text-center text-[12px] text-muted-k font-medium whitespace-nowrap"
                                >
                                    {p.label}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {!isEmpty && (
                <p className="text-xs text-muted-k mt-4">
                    Hover any bar for the gross and co-payment breakdown. Figures are computed from your decoded line items.
                </p>
            )}
        </div>
    );
}

/* ---------- Anomalies Over Time ---------- */
function AnomalyTimeline({ data, hasData }) {
    const isEmpty = !hasData || data.length === 0;
    const totalAlerts = data.reduce((acc, d) => acc + d.alerts, 0);
    const totalWarns = data.reduce((acc, d) => acc + d.warns, 0);
    const totalInfos = data.reduce((acc, d) => acc + d.infos, 0);
    const maxTotal = isEmpty ? 1 : Math.max(...data.map((x) => x.alerts + x.warns + x.infos), 1);
    const yTicks = useMemo(() => buildIntegerTicks(maxTotal), [maxTotal]);

    return (
        <div
            className="bg-surface border border-kindred rounded-2xl p-5 md:p-6 shadow-sm"
            data-testid="anomaly-timeline"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-muted-k">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="overline">Anomalies Over Time</span>
                    </div>
                    <div className="mt-1 font-heading text-2xl text-primary-k">
                        {isEmpty ? "Patterns appear once we have a few statements" : `Last ${data.length} ${data.length === 1 ? "statement" : "statements"}`}
                    </div>
                </div>
                {!isEmpty && (
                    <div className="flex flex-col items-end gap-0.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-terracotta">
                            <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-terracotta" /> {totalAlerts} alert{totalAlerts === 1 ? "" : "s"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-gold-700">
                            <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-gold" /> {totalWarns} warn{totalWarns === 1 ? "" : "ings"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-muted-k">
                            <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-sage" /> {totalInfos} info
                        </span>
                    </div>
                )}
            </div>

            {/* Legend with shape indicators per §2 */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-k">
                <span className="inline-flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-terracotta" /> Alert
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-gold" /> Warning
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-sage" /> Info
                </span>
            </div>

            {/* Chart area */}
            <div className="mt-4 relative" aria-label="Anomaly counts per statement">
                {isEmpty ? (
                    <EmptyChartState
                        height={240}
                        message="No data yet. Once anomalies are detected on your decoded statements, you will see patterns here."
                    />
                ) : (
                    <>
                        <div className="relative" style={{ height: 240 }}>
                            {/* Y-axis tick labels */}
                            <div className="absolute inset-y-0 left-0 w-10 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((tick, i) => (
                                    <div
                                        key={`atick-${i}`}
                                        className="text-[11px] text-muted-k tabular-nums pr-2 text-right leading-none"
                                        style={{ fontVariantNumeric: "tabular-nums" }}
                                    >
                                        {tick}
                                    </div>
                                ))}
                            </div>

                            {/* Gridlines */}
                            <div className="absolute inset-y-0 left-10 right-0 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((_, i) => (
                                    <div
                                        key={`agrid-${i}`}
                                        className="w-full border-t"
                                        style={{ borderColor: "var(--kindred-border, rgba(14,77,82,0.18))" }}
                                    />
                                ))}
                            </div>

                            {/* Bars */}
                            <div className="absolute inset-y-0 left-10 right-0 flex items-end justify-around gap-2 md:gap-3">
                                {data.map((d, idx) => {
                                    const total = d.alerts + d.warns + d.infos;
                                    const heightPct = Math.max(2, (total / maxTotal) * 100);
                                    return (
                                        <div
                                            key={d.id}
                                            className="flex-1 flex flex-col items-center gap-2 group h-full justify-end"
                                            data-testid={`anomaly-bar-${idx}`}
                                        >
                                            {/* Value above bar */}
                                            <div className="text-[12px] font-semibold text-primary-k tabular-nums whitespace-nowrap">
                                                {total || ""}
                                            </div>

                                            {/* Stacked bar */}
                                            <div
                                                className="w-full max-w-[56px] relative rounded-t-xl overflow-hidden flex flex-col-reverse shadow-sm group-hover:shadow-md transition-shadow"
                                                style={{ height: `${heightPct}%`, minHeight: total ? "12px" : "4px" }}
                                                title={`${d.label}: ${d.alerts} alert${d.alerts === 1 ? "" : "s"}, ${d.warns} warning${d.warns === 1 ? "" : "s"}, ${d.infos} info`}
                                            >
                                                {total === 0 ? (
                                                    <div className="w-full h-full bg-sage/30" />
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
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* X-axis labels */}
                        <div className="pl-10 mt-2 flex justify-around gap-2 md:gap-3">
                            {data.map((d) => (
                                <div
                                    key={`xa-${d.id}`}
                                    className="flex-1 text-center text-[12px] text-muted-k font-medium whitespace-nowrap"
                                >
                                    {d.label}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ---------- Empty State ---------- */
function EmptyChartState({ height, message }) {
    return (
        <div
            className="relative flex flex-col items-center justify-center rounded-xl border border-dashed border-kindred"
            style={{ height, opacity: 0.85 }}
        >
            {/* Faint placeholder bars */}
            <div className="absolute inset-0 flex items-end justify-around gap-3 px-6 pb-6 pointer-events-none" style={{ opacity: 0.2 }}>
                {[40, 65, 50, 80, 55, 70].map((h, i) => (
                    <div
                        key={i}
                        className="flex-1 max-w-[56px] rounded-t-xl"
                        style={{ height: `${h}%`, background: "var(--kindred-primary)" }}
                    />
                ))}
            </div>
            <div className="relative z-10 flex flex-col items-center gap-2 text-center px-6">
                <Inbox className="h-6 w-6 text-muted-k" />
                <p className="text-sm text-muted-k max-w-xs">{message}</p>
            </div>
        </div>
    );
}

/* ---------- helpers ---------- */
function buildBurnSeries(statements) {
    if (!statements?.length) return [];
    const sorted = [...statements].sort((a, b) => new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0));
    const slice = sorted.slice(-6);
    const rawLabels = slice.map((s) => shortPeriod(s.period_label || s.filename || s.uploaded_at));
    const labels = disambiguateLabels(rawLabels, slice);
    return slice.map((s, i) => {
        const gross = (s.line_items || []).reduce((sum, li) => sum + (li.total || 0), 0);
        const copay = (s.line_items || []).reduce((sum, li) => sum + (li.copayment || li.copay || 0), 0);
        return {
            label: labels[i],
            gross: Math.round(gross),
            copay: Math.round(copay),
        };
    });
}

function buildAnomalyStrip(statements) {
    if (!statements?.length) return [];
    const sorted = [...statements].sort((a, b) => new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0));
    const slice = sorted.slice(-8);
    const rawLabels = slice.map((s) => shortPeriod(s.period_label || s.filename || s.uploaded_at));
    const labels = disambiguateLabels(rawLabels, slice);
    return slice.map((s, idx) => {
        const an = s.anomalies || [];
        const sevCounts = an.reduce(
            (acc, a) => {
                const sev = (a.severity || "").toLowerCase();
                acc[sev === "alert" ? "alerts" : sev === "warning" ? "warns" : "infos"]++;
                return acc;
            },
            { alerts: 0, warns: 0, infos: 0 }
        );
        return {
            id: s.id,
            label: labels[idx],
            ...sevCounts,
        };
    });
}

function disambiguateLabels(labels, statements) {
    // If any labels repeat, append a 2-digit year derived from each statement's uploaded_at/period_label.
    const counts = labels.reduce((acc, l) => { acc[l] = (acc[l] || 0) + 1; return acc; }, {});
    if (Object.values(counts).every((c) => c === 1)) return labels;
    return labels.map((label, i) => {
        if (counts[label] === 1) return label;
        const stmt = statements[i] || {};
        const src = stmt.period_label || stmt.uploaded_at || "";
        const yMatch = String(src).match(/\b(20\d{2})\b/);
        const year = yMatch ? yMatch[1].slice(-2) : "";
        return year ? `${label} '${year}` : `${label} ${i + 1}`;
    });
}

function shortPeriod(s) {
    if (!s) return "n/a";
    const m = String(s).match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (m) return m[0][0].toUpperCase() + m[0].slice(1, 3).toLowerCase();
    try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toLocaleString("en-AU", { month: "short" });
    } catch {
        /* fall through to slice */
    }
    return String(s).slice(0, 6);
}

function formatShort(n) {
    if (!n) return "$0";
    if (n >= 1000) return `$${Math.round(n / 100) / 10}k`;
    return `$${n}`;
}

function buildTicks(maxValue) {
    if (!maxValue || maxValue <= 0) return [0, 1];
    const niceMax = niceCeil(maxValue);
    const step = niceMax / GRIDLINE_COUNT;
    return Array.from({ length: GRIDLINE_COUNT + 1 }, (_, i) => Math.round(step * i));
}

function buildIntegerTicks(maxValue) {
    const m = Math.max(1, Math.ceil(maxValue));
    const niceMax = m <= 4 ? m : Math.ceil(m / 4) * 4;
    const step = niceMax / 4;
    return Array.from({ length: 5 }, (_, i) => Math.round(step * i));
}

function niceCeil(n) {
    if (n <= 100) return Math.ceil(n / 50) * 50;
    if (n <= 1000) return Math.ceil(n / 100) * 100;
    if (n <= 10000) return Math.ceil(n / 500) * 500;
    if (n <= 100000) return Math.ceil(n / 5000) * 5000;
    return Math.ceil(n / 50000) * 50000;
}
