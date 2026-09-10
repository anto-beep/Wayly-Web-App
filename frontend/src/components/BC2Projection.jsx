/**
 * BC2Projection — "Budget Runway" dashboard widget.
 * Plain-English, colour-blocked view of: how much of this quarter's budget is
 * used, how the lifetime cap is tracking, and a simple forecast of the next
 * three quarters. Built for older adults: big numbers, clear words, no jargon.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { TrendingUp, PiggyBank, ArrowRight, CalendarDays } from "lucide-react";

function money(n) {
    if (n == null || Number.isNaN(Number(n))) return "$0";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(n));
}

// Friendly end-of-quarter phrasing, e.g. "Jul-Sep 2026" -> "30 Sep".
function quarterEndPhrase(label) {
    if (!label) return "the end of the quarter";
    const m = String(label).match(/([A-Za-z]{3})-([A-Za-z]{3})\s*(\d{4})?/);
    const ends = { Mar: "31 Mar", Jun: "30 Jun", Sep: "30 Sep", Dec: "31 Dec" };
    if (m && ends[m[2]]) return ends[m[2]];
    return "the end of the quarter";
}

export default function BC2Projection({ participantId }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(false);

    useEffect(() => {
        if (!participantId) return;
        let cancelled = false;
        api.get(`/bc2/participants/${participantId}/projection`)
            .then((r) => { if (!cancelled) setData(r.data); })
            .catch(() => { if (!cancelled) setErr(true); });
        return () => { cancelled = true; };
    }, [participantId]);

    if (err || !participantId) return null;
    if (!data) {
        return (
            <div className="rounded-2xl border border-kindred bg-surface p-5 animate-pulse" data-testid="bc2-projection-loading">
                <div className="h-4 w-40 bg-primary-k/10 rounded" />
                <div className="h-24 mt-3 bg-primary-k/[0.05] rounded-xl" />
            </div>
        );
    }

    const cur = data.current_quarter;
    const cap = data.lifetime_cap_position;
    const pct = cur.quarterly_budget_aud ? Math.min(100, Math.round((cur.burn_total_aud / cur.quarterly_budget_aud) * 100)) : 0;
    const capPct = cap.lifetime_cap_aud ? Math.min(100, Math.round((cap.contributed_to_date_aud / cap.lifetime_cap_aud) * 100)) : 0;

    // Traffic-light tone for the quarter fill.
    const overBudget = pct >= 100;
    const barTone = pct >= 90 ? "bg-terracotta" : pct >= 75 ? "bg-gold" : "bg-sage";
    const statusTone = pct >= 90 ? "text-terracotta" : pct >= 75 ? "text-[#6B4A0F]" : "text-sage";
    const capTone = capPct >= 80 ? "bg-terracotta" : capPct >= 60 ? "bg-gold" : "bg-clay";
    const endPhrase = quarterEndPhrase(cur.quarter_label);

    return (
        <div className="rounded-2xl border border-kindred bg-surface overflow-hidden shadow-sm" data-testid="bc2-projection-card">
            {/* Soft header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 bg-[rgba(14,77,82,0.05)] border-b border-kindred">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary-k/10 text-primary-k">
                        <TrendingUp className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-k">Budget runway</p>
                        <h3 className="font-heading text-lg text-primary-k leading-tight truncate">Where your money stands</h3>
                    </div>
                </div>
                <Link
                    to="/app/budget-scenarios"
                    data-testid="bc2-projection-open-scenarios"
                    className="flex-none inline-flex items-center gap-1 rounded-pill border border-primary-k/25 bg-surface hover:bg-surface-2 text-primary-k text-xs font-medium px-3 py-1.5 transition-colors"
                >
                    Adjust &amp; Compare <ArrowRight className="w-3 h-3" />
                </Link>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
                {/* This quarter — the hero number */}
                <div className="rounded-xl border border-primary-k/15 border-l-4 border-l-primary-k bg-[linear-gradient(135deg,rgba(14,77,82,0.07),rgba(107,143,113,0.05))] p-4 shadow-sm">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-sm text-primary-k font-semibold">This quarter · {cur.quarter_label}</span>
                        <span className="text-sm text-primary-k font-semibold tabular-nums" data-testid="bc2-projection-burn">
                            {money(cur.burn_total_aud)} <span className="text-muted-k font-normal">of {money(cur.quarterly_budget_aud)}</span>
                        </span>
                    </div>
                    <div className="mt-3 h-3.5 rounded-full bg-primary-k/10 overflow-hidden">
                        <div className={`h-full ${barTone} rounded-full transition-all duration-500`} style={{ width: `${Math.max(2, pct)}%` }} data-testid="bc2-projection-burn-bar" />
                    </div>
                    <p className={`text-[0.95rem] mt-2.5 font-semibold ${statusTone}`}>
                        {overBudget
                            ? `You have gone over this quarter's budget by ${money(cur.burn_total_aud - cur.quarterly_budget_aud)}.`
                            : `${money(cur.headroom_aud)} left to spend before ${endPhrase}.`}
                    </p>
                </div>

                {/* Lifetime cap — soft clay */}
                <div className="rounded-xl border border-clay/30 bg-clay/[0.08] p-4">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-sm font-medium text-primary-k inline-flex items-center gap-1.5">
                            <PiggyBank className="h-4 w-4 text-clay" /> Lifetime cap
                        </span>
                        <span className="text-sm font-semibold text-primary-k tabular-nums" data-testid="bc2-projection-cap">
                            {money(cap.contributed_to_date_aud)} <span className="text-muted-k font-normal">of {money(cap.lifetime_cap_aud)}</span>
                        </span>
                    </div>
                    <div className="mt-3 h-3 rounded-full bg-clay/15 overflow-hidden">
                        <div className={`h-full ${capTone} rounded-full transition-all duration-500`} style={{ width: `${Math.max(2, capPct)}%` }} data-testid="bc2-projection-cap-bar" />
                    </div>
                    <p className="text-sm mt-2 text-muted-k">
                        {money(cap.remaining_headroom_aud)} of your lifetime contributions still to go.
                    </p>
                </div>

                {/* Next 3 quarters forecast */}
                {data.next_quarters?.length > 0 && (
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-primary-k/50 mb-2.5 flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5" /> If spending stays the same
                        </p>
                        <div className="grid grid-cols-3 gap-2.5">
                            {data.next_quarters.map((q, i) => {
                                const short = String(q.quarter_label || "").replace(/\s*\d{4}$/, "");
                                const ok = q.projected_headroom_aud >= 0;
                                return (
                                    <div key={i} data-testid={`bc2-projection-next-${i}`}
                                        className={`rounded-xl border p-3 ${ok ? "border-sage/40 bg-sage/[0.08]" : "border-terracotta/40 bg-terracotta/[0.07]"}`}>
                                        <p className="text-[11px] text-muted-k font-medium truncate">{short}</p>
                                        <p className="text-base text-primary-k font-semibold mt-1 tabular-nums">{money(q.projected_spend_aud)}</p>
                                        <p className={`text-[11px] mt-1 font-medium ${ok ? "text-sage" : "text-terracotta"}`}>
                                            {ok ? "Within budget" : `${money(Math.abs(q.projected_headroom_aud))} over`}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
