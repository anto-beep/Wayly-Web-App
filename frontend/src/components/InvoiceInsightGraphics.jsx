import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ChevronRight } from "lucide-react";

function aud(n) {
    const v = Number(n);
    return isFinite(v) ? `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}
function impact(f) {
    return Number(
        f?.financial_impact?.amount ?? f?.observed?.overcharge_amount ?? f?.observed?.refund_amount ??
        f?.observed?.excess_amount ?? f?.observed?.difference ?? f?.observed?.gst_amount ??
        f?.observed?.contribution_amount ?? 0
    );
}
function sumRefund(findings) {
    const seen = new Set();
    let t = 0;
    for (const f of findings || []) {
        const v = impact(f);
        if (!isFinite(v) || v <= 0) continue;
        const ids = (f?.line_ids || f?.affected_line_ids || []).slice().sort().join("|");
        const key = ids ? `${f?.check_id || ""}::${ids}` : `raw::${Math.random()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        t += v;
    }
    return t;
}
function bandOf(f) {
    const tr = Number(f?.tier);
    if (isFinite(tr) && tr > 0) { if (tr <= 2) return "high"; if (tr === 3) return "medium"; return "low"; }
    const s = String(f?.severity || f?.priority || "medium").toLowerCase();
    if (s.includes("block") || s.includes("critical") || s.includes("high")) return "high";
    if (s.includes("low") || s.includes("info") || s.includes("watch")) return "low";
    return "medium";
}
const scrollTo = (sel) => {
    const el = typeof document !== "undefined" && document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

/**
 * InvoiceInsightGraphics — glanceable, image-free graphics for a saved invoice,
 * mirroring StatementInsightGraphics. "Where your money stands" (net payable vs
 * potential refund) and "What we found" (severity breakdown). Every data point
 * is tappable and jumps to the issue register.
 */
export default function InvoiceInsightGraphics({ reconciliation }) {
    const rec = reconciliation || {};
    const findings = rec.findings || [];
    const billed = Number(rec.invoice_total || 0);
    const refund = sumRefund(findings);
    const net = Math.max(0, billed - refund);
    const bands = { high: 0, medium: 0, low: 0 };
    findings.forEach((f) => { bands[bandOf(f)] += 1; });
    const totalFlags = findings.length;
    const netPct = billed > 0 ? Math.round((net / billed) * 100) : 0;
    const money = [
        { name: "Net payable", value: net, color: "#8FBF95" },
        { name: "Potential refund", value: refund, color: "#F0B267" },
    ].filter((d) => d.value > 0);
    const sevData = [
        { name: "High priority", value: bands.high, color: "#F0857A" },
        { name: "Worth a look", value: bands.medium, color: "#F0B267" },
        { name: "For your info", value: bands.low, color: "#A8C7AB" },
    ].filter((d) => d.value > 0);

    if (billed <= 0 && totalFlags === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="invoice-graphics">
            {billed > 0 && (
                <div className="sect-teal border border-kindred rounded-2xl p-5" data-testid="invoice-money-graphic">
                    <div className="text-xs uppercase tracking-wider text-muted-k">Where Your Money Stands</div>
                    <div className="mt-2 flex items-center gap-5">
                        <div className="relative h-[148px] w-[148px] flex-none">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={money} dataKey="value" innerRadius={50} outerRadius={70} startAngle={90} endAngle={-270} stroke="none" paddingAngle={2}>
                                        {money.map((d) => <Cell key={d.name} fill={d.color} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-heading text-xl text-primary-k tabular-nums leading-none">{netPct}%</span>
                                <span className="text-[9px] uppercase tracking-wider text-muted-k mt-0.5">payable</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between rounded-lg item-teal border p-2.5"><span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: "#8FBF95" }} />Net payable</span><span className="font-semibold text-primary-k tabular-nums">{aud(net)}</span></div>
                            <div className="flex items-center justify-between rounded-lg item-clay border p-2.5"><span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: "#F0B267" }} />Potential refund</span><span className="font-semibold text-primary-k tabular-nums">{aud(refund)}</span></div>
                            <div className="text-[11px] text-muted-k pl-1">of {aud(billed)} billed</div>
                        </div>
                    </div>
                </div>
            )}
            {totalFlags > 0 && (
                <div className="sect-clay border border-kindred rounded-2xl p-5" data-testid="invoice-severity-graphic">
                    <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-wider text-muted-k">What We Found</div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-k inline-flex items-center gap-0.5">Tap to open <ChevronRight className="h-3 w-3" /></span>
                    </div>
                    <div className="mt-2 flex items-center gap-5">
                        <button type="button" onClick={() => scrollTo("[data-testid=inv1-issue-register]")} data-testid="invoice-severity-donut" aria-label={`${totalFlags} things to check. Open the list.`} className="relative h-[148px] w-[148px] flex-none rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k">
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
                                <button key={d.name} type="button" onClick={() => scrollTo("[data-testid=inv1-issue-register]")} data-testid={`invoice-severity-${d.name.replace(/\W+/g, "-").toLowerCase()}`} className="w-full flex items-center justify-between gap-2 rounded-lg border border-kindred px-2.5 py-2 text-left transition-transform hover:scale-[1.02] hover:shadow-sm">
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
