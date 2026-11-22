/**
 * BudgetLadderCard — FUNDTRACK-1 canonical figure ladder (locked decision #2).
 *
 * Renders the eight figures A..H exactly as the shared server-side engine
 * computed them, with ONE label per key (from ladder.labels) so the dashboard,
 * Budget Scenarios and the weekly screen all show identical values and labels.
 *
 * F ("Left for care this quarter") is the headline. H ("Spare for extra care")
 * always appears directly beneath F. The utilisation ring shows E as a share of
 * D, with a second mark for how far through the quarter today is, plus a text
 * equivalent for screen readers (WCAG).
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, Info, CheckCircle2, AlertTriangle } from "lucide-react";

const AUD = (n) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(Number(n) || 0);

function UtilRing({ usedPct, elapsedPct, tone }) {
    const size = 120, stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const used = Math.max(0, Math.min(100, usedPct || 0));
    const off = c - (used / 100) * c;
    // Elapsed marker: a tick at the elapsed fraction around the ring.
    const ang = (Math.max(0, Math.min(100, elapsedPct || 0)) / 100) * 2 * Math.PI - Math.PI / 2;
    const mx = size / 2 + r * Math.cos(ang), my = size / 2 + r * Math.sin(ang);
    return (
        <div className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }} data-testid="ladder-util-ring"
            role="img"
            aria-label={`${used}% of the funding available this quarter has been used, and the quarter is ${elapsedPct}% elapsed.`}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(14,77,82,0.10)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c} style={{ strokeDashoffset: off, transition: "stroke-dashoffset 600ms ease" }} />
            </svg>
            <svg width={size} height={size} className="absolute inset-0">
                <circle cx={mx} cy={my} r={4} fill="#0E4D52" stroke="#fff" strokeWidth={2} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-heading text-2xl leading-none tabular-nums" style={{ color: tone }}>{used}%</span>
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-k mt-0.5">used of available</span>
            </div>
        </div>
    );
}

function Row({ k, label, value, strong, testid }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1.5" data-testid={testid}>
            <span className={`text-sm ${strong ? "font-semibold text-primary-k" : "text-muted-k"}`}>{label}</span>
            <span className={`tabular-nums ${strong ? "font-heading text-lg text-primary-k" : "text-sm text-primary-k/80"}`} data-testid={`ladder-figure-${k}`}>{value}</span>
        </div>
    );
}

export default function BudgetLadderCard({ ladder }) {
    const [open, setOpen] = useState(false);
    const [confOpen, setConfOpen] = useState(false);
    if (!ladder || !ladder.figures) return null;
    const f = ladder.figures;
    const L = ladder.labels || {};
    const q = ladder.quarter || {};
    const status = ladder.status;
    const proj = ladder.projection || {};
    const util = ladder.utilisation || {};
    const conf = ladder.confidence || {};

    const tone = status === "overspend_risk" ? "#C0392B" : status === "underspend_risk" ? "#C2683D" : "#4E6E54";
    const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };

    return (
        <div className="rounded-2xl border border-kindred bg-surface overflow-hidden shadow-sm" data-testid="budget-ladder-card">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-[rgba(14,77,82,0.05)] border-b border-kindred">
                <p className="text-sm font-semibold text-primary-k">This quarter · {q.label}</p>
                <p className="text-xs text-muted-k" data-testid="ladder-as-at">{q.elapsed_pct}% through · as at {fmtDate(q.as_at)}</p>
            </div>

            <div className="p-5 flex flex-col sm:flex-row items-center gap-5">
                <UtilRing usedPct={util.used_pct_of_available} elapsedPct={util.elapsed_pct} tone={tone} />
                <div className="min-w-0 flex-1 w-full">
                    {/* F = the headline everywhere */}
                    <Row k="F" label={L.F} value={AUD(f.F)} strong testid="ladder-row-F" />
                    {/* H = always directly beneath F */}
                    <Row k="H" label={L.H} value={AUD(f.H)} testid="ladder-row-H" />
                    <div className="my-1 border-t border-kindred/70" />
                    <Row k="D" label={L.D} value={AUD(f.D)} testid="ladder-row-D" />
                    <Row k="E" label={L.E} value={AUD(f.E)} testid="ladder-row-E" />
                </div>
            </div>

            {/* Status + forfeit / shortfall (never hides a loss, never over-warns) */}
            <div className="px-5 pb-3">
                {status === "underspend_risk" && (
                    <p className="text-sm font-medium text-[#6B4A0F] flex items-start gap-1.5" data-testid="ladder-status">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-none" />
                        <span data-testid="ladder-forfeit">About {AUD(proj.forfeit_aud)} of this quarter's care funding looks likely to be returned on {fmtDate(proj.forfeit_date)} (based on the pace of spending so far). Anything unspent above {AUD(ladder.carryover_cap_aud)} cannot be carried over. It may be worth talking to your provider about care you need but are not getting.</span>
                    </p>
                )}
                {status === "overspend_risk" && (
                    <p className="text-sm font-medium text-terracotta flex items-start gap-1.5" data-testid="ladder-status">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-none" />
                        <span data-testid="ladder-shortfall">Booked care is estimated to be about {AUD(proj.shortfall_aud)} above what is left this quarter. Check those prices or ask your provider to confirm your balance. Your service agreement sets out who pays if an overspend happens.</span>
                    </p>
                )}
                {status === "on_track" && (
                    <p className="text-sm font-medium text-sage flex items-center gap-1.5" data-testid="ladder-status">
                        <CheckCircle2 className="w-4 h-4 flex-none" /> On track. Nothing in this budget needs action right now.
                    </p>
                )}
                <p className="text-[11px] text-muted-k mt-1.5">{proj.provisional_note}</p>
            </div>

            {/* Full breakdown A, B, C, G */}
            <button onClick={() => setOpen((v) => !v)} data-testid="ladder-breakdown-toggle"
                className="w-full flex items-center justify-between px-5 py-2.5 text-sm text-primary-k border-t border-kindred hover:bg-surface-2 transition-colors">
                <span className="inline-flex items-center gap-1.5">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Show the full breakdown</span>
            </button>
            {open && (
                <div className="px-5 pb-4">
                    <Row k="A" label={L.A} value={AUD(f.A)} testid="ladder-row-A" />
                    <Row k="B" label={L.B} value={`− ${AUD(f.B)}`} testid="ladder-row-B" />
                    <Row k="C" label={L.C} value={AUD(f.C)} testid="ladder-row-C" />
                    <Row k="G" label={L.G} value={AUD(f.G)} testid="ladder-row-G" />
                </div>
            )}

            {/* Confidence, derived and inspectable (never asserted) */}
            <div className="px-5 py-3 border-t border-kindred flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full bg-primary-k/[0.07] px-3 py-1.5 text-primary-k" data-testid="ladder-confidence">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: conf.level === "high" ? "#4E6E54" : conf.level === "medium" ? "#C2683D" : "#B4472B" }} />
                    Confidence: {conf.level ? conf.level.charAt(0).toUpperCase() + conf.level.slice(1) : "—"}
                </span>
                {(conf.inputs || []).length > 0 && (
                    <button onClick={() => setConfOpen((v) => !v)} data-testid="ladder-confidence-toggle" className="text-xs text-primary-k inline-flex items-center gap-1 hover:underline">
                        <Info className="w-3.5 h-3.5" /> What this is based on
                    </button>
                )}
            </div>
            {confOpen && (
                <ul className="px-5 pb-4 space-y-1.5" data-testid="ladder-confidence-inputs">
                    {(conf.inputs || []).map((inp, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-k">
                            <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-none ${inp.ok ? "bg-sage" : "bg-terracotta"}`} />
                            <span><span className="font-medium text-primary-k">{inp.label}: {inp.value}.</span> {inp.detail}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
