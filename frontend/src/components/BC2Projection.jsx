/**
 * BC2Projection dashboard widget.
 * Shows current-quarter burn vs budget, next 3 quarters forecast, and
 * lifetime-cap headroom, all in one glanceable card.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { TrendingUp, PiggyBank, ArrowRight, LineChart } from "lucide-react";

function money(n) {
    if (n == null || Number.isNaN(Number(n))) return "$-";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(n));
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
            <div className="rounded-2xl border border-primary-k/10 bg-white p-5 animate-pulse" data-testid="bc2-projection-loading">
                <div className="h-4 w-40 bg-primary-k/10 rounded"/>
                <div className="h-16 mt-3 bg-primary-k/[0.05] rounded"/>
            </div>
        );
    }

    const cur = data.current_quarter;
    const cap = data.lifetime_cap_position;
    const pct = cur.quarterly_budget_aud ? Math.min(100, Math.round((cur.burn_total_aud / cur.quarterly_budget_aud) * 100)) : 0;
    const capPct = cap.lifetime_cap_aud ? Math.min(100, Math.round((cap.contributed_to_date_aud / cap.lifetime_cap_aud) * 100)) : 0;
    const barTone = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";
    const capTone = capPct >= 80 ? "bg-red-500" : capPct >= 60 ? "bg-amber-500" : "bg-primary-k";

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid="bc2-projection-card">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wider text-primary-k/50">Budget Snapshot</p>
                    <h3 className="font-heading text-lg text-primary-k mt-0.5">Where You Stand This Quarter</h3>
                </div>
                <Link to="/app/budget-scenarios" data-testid="bc2-projection-open-scenarios"
                      className="text-xs inline-flex items-center gap-1 text-primary-k hover:underline">
                    Adjust & Compare <ArrowRight className="w-3 h-3"/>
                </Link>
            </div>

            <div>
                <div className="flex items-baseline justify-between text-sm">
                    <span className="text-primary-k">
                        <TrendingUp className="inline w-3.5 h-3.5 mr-1"/> {cur.quarter_label}
                    </span>
                    <span className="text-primary-k font-medium" data-testid="bc2-projection-burn">
                        {money(cur.burn_total_aud)} / {money(cur.quarterly_budget_aud)}
                    </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-primary-k/10 overflow-hidden">
                    <div className={`h-full ${barTone} transition-all`} style={{ width: `${pct}%` }} data-testid="bc2-projection-burn-bar"/>
                </div>
                <p className="text-[11px] text-muted-k mt-1">
                    {pct >= 100 ? "Over budget for this quarter" : `${money(cur.headroom_aud)} headroom (${100 - pct}%) remaining`}
                </p>
            </div>

            <div>
                <div className="flex items-baseline justify-between text-sm">
                    <span className="text-primary-k">
                        <PiggyBank className="inline w-3.5 h-3.5 mr-1"/> Lifetime Cap
                    </span>
                    <span className="text-primary-k font-medium" data-testid="bc2-projection-cap">
                        {money(cap.contributed_to_date_aud)} / {money(cap.lifetime_cap_aud)}
                    </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-primary-k/10 overflow-hidden">
                    <div className={`h-full ${capTone} transition-all`} style={{ width: `${capPct}%` }} data-testid="bc2-projection-cap-bar"/>
                </div>
                <p className="text-[11px] text-muted-k mt-1">
                    {money(cap.remaining_headroom_aud)} headroom before hitting the cap
                </p>
            </div>

            {data.next_quarters?.length > 0 && (
                <div>
                    <p className="text-xs uppercase tracking-wider text-primary-k/50 mb-2 flex items-center gap-1">
                        <LineChart className="w-3.5 h-3.5"/> Next 3 Quarters
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {data.next_quarters.map((q, i) => (
                            <div key={i} data-testid={`bc2-projection-next-${i}`}
                                 className="rounded-lg border border-primary-k/10 p-2">
                                <p className="text-[10px] text-muted-k truncate">{q.quarter_label}</p>
                                <p className="text-sm text-primary-k font-medium mt-0.5">{money(q.projected_spend_aud)}</p>
                                <p className={`text-[10px] ${q.projected_headroom_aud < 0 ? "text-red-600" : "text-emerald-700"}`}>
                                    {q.projected_headroom_aud >= 0 ? "+" : ""}{money(q.projected_headroom_aud)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
