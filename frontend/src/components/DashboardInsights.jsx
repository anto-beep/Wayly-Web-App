import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, ShieldCheck, AlertTriangle, AlertCircle, Info, Inbox } from "lucide-react";
import { formatAUD2 } from "@/lib/api";

/**
 * DashboardInsights — two plain-English visuals for the caregiver dashboard.
 *
 *   1. "Where the money goes" — a stacked monthly bar: how much was billed each
 *      month, split into what the government funded vs what YOU paid (co-payment).
 *      Answers "how much am I actually paying, and is it going up?".
 *   2. "Statement checks" — how many things Wayly flagged on each statement and
 *      how many still need your attention, in plain language.
 *
 * Both use month-word + year labels (e.g. "Apr '26"), clear titles + headline
 * figures, distinct meaningful colours, and readable empty states.
 */

const GRIDLINE_COUNT = 4;

// Distinct, meaningful palette
const C = {
    funded: "#0E4D52",   // teal ink — government funded
    copay: "#C2683D",    // warm clay — your co-payment (out of pocket)
    attention: "#C0392B", // terracotta — needs your attention
    watch: "#D98A3D",    // amber — worth a look
    ok: "#4E6E54",       // sage — all good / FYI
    grid: "rgba(14,77,82,0.14)",
};

export default function DashboardInsights({ statements }) {
    const burnSeries = useMemo(() => buildBurnSeries(statements), [statements]);
    const anomalyStrip = useMemo(() => buildAnomalyStrip(statements), [statements]);

    const hasData = statements && statements.length > 0;

    return (
        <div className="grid lg:grid-cols-2 gap-4 md:gap-6" data-testid="dashboard-insights">
            <SpendingChart series={burnSeries} hasData={hasData} />
            <ChecksChart data={anomalyStrip} hasData={hasData} />
        </div>
    );
}

/* ---------- 1. Where the money goes ---------- */
function SpendingChart({ series, hasData }) {
    const navigate = useNavigate();
    const isEmpty = !hasData || series.length === 0;

    const totalGross = series.reduce((s, p) => s + p.gross, 0);
    const totalCopay = series.reduce((s, p) => s + p.copay, 0);
    const copayPct = totalGross > 0 ? Math.round((totalCopay / totalGross) * 100) : 0;
    const maxGross = isEmpty ? 1 : Math.max(...series.map((p) => p.gross), 1);
    const yTicks = useMemo(() => buildTicks(maxGross), [maxGross]);
    const rangeLabel = isEmpty ? "" : series.length === 1 ? series[0].label : `${series[0].label} – ${series[series.length - 1].label}`;

    return (
        <div className="bg-surface-2 border border-kindred rounded-2xl p-5 md:p-6 shadow-sm" data-testid="burn-rate-chart">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-muted-k">
                        <Wallet className="h-4 w-4" />
                        <span className="overline">Where the money goes</span>
                    </div>
                    <div className="mt-1 font-heading text-xl sm:text-2xl text-primary-k leading-tight">
                        {isEmpty ? "Once your first statement is decoded" : "What you pay vs what's funded"}
                    </div>
                    {!isEmpty && <div className="text-xs text-muted-k mt-0.5">{rangeLabel}</div>}
                </div>
                {!isEmpty && (
                    <div className="text-right flex-none">
                        <div className="text-[11px] uppercase tracking-wider text-muted-k">Total billed</div>
                        <div className="font-heading text-2xl tabular-nums text-primary-k">{formatAUD2(totalGross)}</div>
                        <div className="text-[11px] text-muted-k">
                            {totalCopay > 0
                                ? <>incl. <span style={{ color: C.copay }}>{formatAUD2(totalCopay)}</span> your co-payment ({copayPct}%)</>
                                : "fully government funded so far"}
                        </div>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-primary-k/70">
                <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block w-3 h-3 rounded-sm" style={{ background: C.funded }} />
                    Government funded
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block w-3 h-3 rounded-sm" style={{ background: C.copay }} />
                    Your co-payment
                </span>
            </div>

            <div className="mt-4 relative" aria-label="Monthly spending split by who pays">
                {isEmpty ? (
                    <EmptyChartState height={260} message="No data yet. Once your provider statement is decoded, we'll show how much you pay each month versus what the government funds." />
                ) : (
                    <>
                        <div className="relative" style={{ height: 260 }}>
                            <div className="absolute inset-y-0 left-0 w-12 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((tick, i) => (
                                    <div key={`t-${i}`} className="text-[11px] text-muted-k tabular-nums pr-2 text-right leading-none">
                                        {tick === 0 ? "$0" : formatShort(tick)}
                                    </div>
                                ))}
                            </div>
                            <div className="absolute inset-y-0 left-12 right-0 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((_, i) => (
                                    <div key={`g-${i}`} className="w-full border-t" style={{ borderColor: C.grid }} />
                                ))}
                            </div>
                            <div className="absolute inset-y-0 left-12 right-0 flex items-end justify-around gap-3 md:gap-4">
                                {series.map((p, idx) => {
                                    const heightPct = Math.max(2, (p.gross / maxGross) * 100);
                                    const funded = Math.max(0, p.gross - p.copay);
                                    return (
                                        <div
                                            key={`${p.label}-${idx}`}
                                            className={`flex-1 flex flex-col items-center gap-2 group h-full justify-end relative rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k/40 ${p.id ? "cursor-pointer" : ""}`}
                                            data-testid={`burn-bar-${idx}`}
                                            role={p.id ? "button" : undefined}
                                            tabIndex={p.id ? 0 : undefined}
                                            aria-label={p.id ? `${p.label}: ${formatAUD2(p.gross)} billed, ${formatAUD2(p.copay)} your co-payment. Open statement.` : undefined}
                                            onClick={p.id ? () => navigate(`/app/statements/${p.id}`) : undefined}
                                            onKeyDown={p.id ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/app/statements/${p.id}`); } } : undefined}
                                        >
                                            <div className="text-[12px] font-semibold text-primary-k tabular-nums whitespace-nowrap">
                                                {formatShort(p.gross)}
                                            </div>
                                            <div
                                                className="w-full max-w-[60px] relative rounded-t-xl overflow-hidden flex flex-col-reverse shadow-sm group-hover:shadow-md transition-shadow"
                                                style={{ height: `${heightPct}%`, minHeight: "10px" }}
                                                title={`${p.label}: ${formatAUD2(p.gross)} billed — ${formatAUD2(p.copay)} your co-payment, ${formatAUD2(funded)} government funded`}
                                            >
                                                {p.copay > 0 && <div style={{ flex: p.copay, background: C.copay }} />}
                                                <div style={{ flex: Math.max(funded, p.gross === 0 ? 1 : 0.0001), background: C.funded }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="pl-12 mt-2 flex justify-around gap-3 md:gap-4">
                            {series.map((p, idx) => (
                                <div key={`x-${idx}`} className="flex-1 text-center text-[12px] text-primary-k/70 font-medium whitespace-nowrap">
                                    {p.label}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {!isEmpty && (
                <p className="text-xs text-muted-k mt-4">
                    Over {series.length} {series.length === 1 ? "month" : "months"} you were billed <strong className="text-primary-k">{formatAUD2(totalGross)}</strong>.{" "}
                    {totalCopay > 0
                        ? <>Your co-payments came to <strong style={{ color: C.copay }}>{formatAUD2(totalCopay)}</strong> ({copayPct}%).</>
                        : <>No co-payment has been recorded yet.</>}{" "}
                    Tap a month to open that statement.
                </p>
            )}
        </div>
    );
}

/* ---------- 2. Statement checks ---------- */
function ChecksChart({ data, hasData }) {
    const navigate = useNavigate();
    const isEmpty = !hasData || data.length === 0;
    const totalAlerts = data.reduce((acc, d) => acc + d.alerts, 0);
    const totalWarns = data.reduce((acc, d) => acc + d.warns, 0);
    const totalInfos = data.reduce((acc, d) => acc + d.infos, 0);
    const maxTotal = isEmpty ? 1 : Math.max(...data.map((x) => x.alerts + x.warns + x.infos), 1);
    const yTicks = useMemo(() => buildIntegerTicks(maxTotal), [maxTotal]);

    return (
        <div className="bg-surface-2 border border-kindred rounded-2xl p-5 md:p-6 shadow-sm" data-testid="anomaly-timeline">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-muted-k">
                        <ShieldCheck className="h-4 w-4" />
                        <span className="overline">Statement checks</span>
                    </div>
                    <div className="mt-1 font-heading text-xl sm:text-2xl text-primary-k leading-tight">
                        {isEmpty ? "Checks appear once we've seen a statement" : `${data.length} ${data.length === 1 ? "statement" : "statements"} reviewed`}
                    </div>
                </div>
                {!isEmpty && (
                    <div className="text-right flex-none">
                        {totalAlerts > 0 ? (
                            <>
                                <div className="font-heading text-2xl tabular-nums" style={{ color: C.attention }}>{totalAlerts}</div>
                                <div className="text-[11px] text-muted-k">need your attention</div>
                            </>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: C.ok }} data-testid="checks-all-clear">
                                <ShieldCheck className="h-3.5 w-3.5" /> All clear
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Legend, plain English */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-primary-k/70">
                <span className="inline-flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" style={{ color: C.attention }} /> Needs attention
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" style={{ color: C.watch }} /> Worth a look
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" style={{ color: C.ok }} /> Just so you know
                </span>
            </div>

            <div className="mt-4 relative" aria-label="Checks flagged per statement">
                {isEmpty ? (
                    <EmptyChartState height={240} message="No data yet. When Wayly checks your decoded statements, anything worth knowing will show up here." />
                ) : (
                    <>
                        <div className="relative" style={{ height: 240 }}>
                            <div className="absolute inset-y-0 left-0 w-10 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((tick, i) => (
                                    <div key={`at-${i}`} className="text-[11px] text-muted-k tabular-nums pr-2 text-right leading-none">{tick}</div>
                                ))}
                            </div>
                            <div className="absolute inset-y-0 left-10 right-0 flex flex-col-reverse justify-between pointer-events-none">
                                {yTicks.map((_, i) => (
                                    <div key={`ag-${i}`} className="w-full border-t" style={{ borderColor: C.grid }} />
                                ))}
                            </div>
                            <div className="absolute inset-y-0 left-10 right-0 flex items-end justify-around gap-2 md:gap-3">
                                {data.map((d, idx) => {
                                    const total = d.alerts + d.warns + d.infos;
                                    const heightPct = Math.max(2, (total / maxTotal) * 100);
                                    return (
                                        <div
                                            key={d.id}
                                            className={`flex-1 flex flex-col items-center gap-2 group h-full justify-end rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k/40 ${d.id ? "cursor-pointer" : ""}`}
                                            data-testid={`anomaly-bar-${idx}`}
                                            role={d.id ? "button" : undefined}
                                            tabIndex={d.id ? 0 : undefined}
                                            aria-label={d.id ? `${d.label}: ${d.alerts} need attention, ${d.warns} worth a look, ${d.infos} FYI. Open statement.` : undefined}
                                            onClick={d.id ? () => navigate(`/app/statements/${d.id}`) : undefined}
                                            onKeyDown={d.id ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/app/statements/${d.id}`); } } : undefined}
                                        >
                                            <div className="text-[12px] font-semibold text-primary-k tabular-nums whitespace-nowrap">
                                                {total || ""}
                                            </div>
                                            <div
                                                className="w-full max-w-[52px] relative rounded-t-xl overflow-hidden flex flex-col-reverse shadow-sm group-hover:shadow-md transition-shadow"
                                                style={{ height: `${heightPct}%`, minHeight: total ? "12px" : "4px" }}
                                                title={`${d.label}: ${d.alerts} need attention, ${d.warns} worth a look, ${d.infos} FYI`}
                                            >
                                                {total === 0 ? (
                                                    <div className="w-full h-full" style={{ background: "rgba(78,110,84,0.28)" }} />
                                                ) : (
                                                    <>
                                                        {d.alerts > 0 && <div style={{ flex: d.alerts, background: C.attention }} />}
                                                        {d.warns > 0 && <div style={{ flex: d.warns, background: C.watch }} />}
                                                        {d.infos > 0 && <div style={{ flex: d.infos, background: C.ok }} />}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="pl-10 mt-2 flex justify-around gap-2 md:gap-3">
                            {data.map((d) => (
                                <div key={`xa-${d.id}`} className="flex-1 text-center text-[12px] text-primary-k/70 font-medium whitespace-nowrap">
                                    {d.label}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {!isEmpty && (
                <p className="text-xs text-muted-k mt-4">
                    {totalAlerts > 0
                        ? <><strong style={{ color: C.attention }}>{totalAlerts}</strong> item{totalAlerts === 1 ? "" : "s"} need your attention{totalWarns > 0 ? `, plus ${totalWarns} worth a look` : ""}. Tap a statement to review.</>
                        : totalWarns + totalInfos > 0
                            ? <>Nothing urgent — {totalWarns > 0 ? `${totalWarns} worth a look` : ""}{totalWarns > 0 && totalInfos > 0 ? " and " : ""}{totalInfos > 0 ? `${totalInfos} for your information` : ""}. Tap a statement to review.</>
                            : <>No issues flagged across these statements — everything looks in order.</>}
                </p>
            )}
        </div>
    );
}

/* ---------- Empty State ---------- */
function EmptyChartState({ height, message }) {
    return (
        <div className="relative flex flex-col items-center justify-center rounded-xl border border-dashed border-kindred" style={{ height, opacity: 0.9 }}>
            <div className="absolute inset-0 flex items-end justify-around gap-3 px-6 pb-6 pointer-events-none" style={{ opacity: 0.16 }}>
                {[40, 65, 50, 80, 55, 70].map((h, i) => (
                    <div key={i} className="flex-1 max-w-[56px] rounded-t-xl" style={{ height: `${h}%`, background: C.funded }} />
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
    return slice.map((s) => {
        const gross = (s.line_items || []).reduce((sum, li) => sum + (li.total || 0), 0);
        const copay = (s.line_items || []).reduce((sum, li) => sum + (li.copayment || li.copay || 0), 0);
        return { id: s.id, label: monthYearLabel(s), gross: Math.round(gross), copay: Math.round(copay) };
    });
}

function buildAnomalyStrip(statements) {
    if (!statements?.length) return [];
    const sorted = [...statements].sort((a, b) => new Date(a.uploaded_at || 0) - new Date(b.uploaded_at || 0));
    const slice = sorted.slice(-8);
    return slice.map((s) => {
        const an = s.anomalies || [];
        const sevCounts = an.reduce(
            (acc, a) => {
                const sev = (a.severity || "").toLowerCase();
                acc[sev === "alert" ? "alerts" : sev === "warning" ? "warns" : "infos"]++;
                return acc;
            },
            { alerts: 0, warns: 0, infos: 0 }
        );
        return { id: s.id, label: monthYearLabel(s), ...sevCounts };
    });
}

// Month-word + 2-digit year, e.g. "Apr '26". Handles month-word labels,
// numeric DD/MM/YYYY (AU) ranges, and ISO upload dates — never a raw fragment.
function monthYearLabel(s) {
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = String(s.period_label || "");
    // 1) month word present in the period label
    const wordM = label.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    const yearM = label.match(/\b(20\d{2})\b/);
    if (wordM) {
        const mo = wordM[0].slice(0, 3);
        const moCap = mo.charAt(0).toUpperCase() + mo.slice(1).toLowerCase();
        if (yearM) return `${moCap} '${yearM[1].slice(-2)}`;
        const d = new Date(s.uploaded_at);
        return isNaN(d.getTime()) ? moCap : `${moCap} '${String(d.getFullYear()).slice(-2)}`;
    }
    // 2) numeric DD/MM/YYYY (Australian order) in the period label
    const numM = label.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if (numM) {
        const mi = Math.min(12, Math.max(1, parseInt(numM[2], 10))) - 1;
        return `${MONTHS[mi]} '${numM[3].slice(-2)}`;
    }
    // 3) fall back to the ISO upload date
    const d = new Date(s.uploaded_at || label);
    if (!isNaN(d.getTime())) return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
    return label.slice(0, 6) || "n/a";
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
