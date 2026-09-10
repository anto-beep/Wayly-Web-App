import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChevronRight } from "lucide-react";
import { formatAUD2 } from "@/lib/api";

// Smoothly scroll to the first matching element (used to "open" the data a
// graphic represents when the user taps it).
function scrollToFirst(selectors) {
    for (const s of selectors) {
        const el = typeof document !== "undefined" && document.querySelector(s);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    }
}
const openAnomalies = () => scrollToFirst(["[data-testid=decoder-anomaly-panel]", "[data-testid=anomaly-top-banner]", "#decoder-anomaly-panel"]);
const openBreakdown = () => scrollToFirst(["[data-testid=decoder-stream-breakdown]", "[data-testid=decoder-line-items]", "[data-testid=decoder-summary-banner]"]);

// Severity counts from either the audit_json.anomaly_count roll-up or the raw
// anomalies list.
function sevCounts(stmt) {
    const ac = stmt.audit_json?.anomaly_count;
    if (ac && (ac.high || ac.medium || ac.low || ac.advisory)) {
        return { high: ac.high || 0, medium: ac.medium || 0, low: (ac.low || 0) + (ac.advisory || 0) };
    }
    const out = { high: 0, medium: 0, low: 0 };
    (stmt.anomalies || stmt.audit_json?.anomalies || []).forEach((a) => {
        const s = a.severity;
        if (s === "alert" || s === "high") out.high += 1;
        else if (s === "info" || s === "low" || s === "advisory") out.low += 1;
        else out.medium += 1;
    });
    return out;
}

/**
 * Two glanceable donut cards — "Where the money went" (government vs you) and
 * "What we found" (severity breakdown). Every data point is now tappable: the
 * donut and each legend row jump to (and reveal) the underlying data — the
 * anomaly/flag list for "What we found", the breakdown for the money split.
 * Shared by the saved statement page and the fresh Statement Decoder run.
 */
export default function StatementInsightGraphics({ stmt }) {
    const ss = stmt.audit_json?.statement_summary || {};
    const gov = Number(ss.total_government_paid) || 0;
    const you = Number(ss.total_participant_contribution) || 0;
    const hasMoney = gov > 0 || you > 0;
    const sev = sevCounts(stmt);
    const totalFlags = sev.high + sev.medium + sev.low;

    const money = [
        { name: "Government paid", value: gov, color: "#8FBF95" },
        { name: "You paid", value: you, color: "#F0B267" },
    ];
    const sevData = [
        { name: "Needs attention", value: sev.high, color: "#F0857A" },
        { name: "Worth a look", value: sev.medium, color: "#F0B267" },
        { name: "For your info", value: sev.low, color: "#A8C7AB" },
    ].filter((d) => d.value > 0);
    const govPct = hasMoney ? Math.round((gov / (gov + you)) * 100) : 0;

    if (!hasMoney && totalFlags === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="statement-graphics">
            {hasMoney && (
                <div className="sect-teal border border-kindred rounded-2xl p-5" data-testid="statement-money-graphic">
                    <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-wider text-muted-k">Where the money went</div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-k inline-flex items-center gap-0.5">Tap to open <ChevronRight className="h-3 w-3" /></span>
                    </div>
                    <div className="mt-2 flex items-center gap-5">
                        <button type="button" onClick={openBreakdown} data-testid="money-graphic-donut" aria-label={`Government paid ${govPct}%, you paid ${100 - govPct}%. Open the breakdown.`} className="relative h-[148px] w-[148px] flex-none rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={money} dataKey="value" innerRadius={50} outerRadius={70} startAngle={90} endAngle={-270} stroke="none" paddingAngle={2}>
                                        {money.map((d) => <Cell key={d.name} fill={d.color} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-heading text-xl text-primary-k tabular-nums leading-none">{govPct}%</span>
                                <span className="text-[9px] uppercase tracking-wider text-muted-k mt-0.5">funded</span>
                            </div>
                        </button>
                        <div className="flex-1 space-y-2">
                            <button type="button" onClick={openBreakdown} data-testid="money-graphic-gov" className="w-full flex items-center justify-between gap-2 rounded-lg item-sage border p-2.5 text-left transition-transform hover:scale-[1.02] hover:shadow-sm">
                                <span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: "#8FBF95" }} /> Government</span>
                                <span className="font-semibold text-primary-k tabular-nums">{formatAUD2(gov)}</span>
                            </button>
                            <button type="button" onClick={openBreakdown} data-testid="money-graphic-you" className="w-full flex items-center justify-between gap-2 rounded-lg item-clay border p-2.5 text-left transition-transform hover:scale-[1.02] hover:shadow-sm">
                                <span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: "#F0B267" }} /> You paid</span>
                                <span className="font-semibold text-primary-k tabular-nums">{formatAUD2(you)}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {totalFlags > 0 && (
                <div className="sect-clay border border-kindred rounded-2xl p-5" data-testid="statement-severity-graphic">
                    <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-wider text-muted-k">What we found</div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-k inline-flex items-center gap-0.5">Tap to open <ChevronRight className="h-3 w-3" /></span>
                    </div>
                    <div className="mt-2 flex items-center gap-5">
                        <button type="button" onClick={openAnomalies} data-testid="severity-graphic-donut" aria-label={`${totalFlags} things to know. Open the list.`} className="relative h-[148px] w-[148px] flex-none rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={sevData} dataKey="value" innerRadius={50} outerRadius={70} startAngle={90} endAngle={-270} stroke="none" paddingAngle={2}>
                                        {sevData.map((d) => <Cell key={d.name} fill={d.color} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-heading text-xl text-primary-k tabular-nums leading-none">{totalFlags}</span>
                                <span className="text-[9px] uppercase tracking-wider text-muted-k mt-0.5">to know</span>
                            </div>
                        </button>
                        <div className="flex-1 space-y-2">
                            {sevData.map((d) => (
                                <button key={d.name} type="button" onClick={openAnomalies} data-testid={`severity-graphic-${d.name.replace(/\W+/g, "-").toLowerCase()}`} className="w-full flex items-center justify-between gap-2 rounded-lg border border-kindred px-2.5 py-2 text-left transition-transform hover:scale-[1.02] hover:shadow-sm">
                                    <span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: d.color }} /> {d.name}</span>
                                    <span className="font-semibold text-primary-k tabular-nums inline-flex items-center gap-1">{d.value} <ChevronRight className="h-3.5 w-3.5 text-muted-k" /></span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
