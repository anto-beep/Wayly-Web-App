import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { CheckCircle2, ArrowRight, ShieldCheck } from "lucide-react";

// Compact top-right account-health widget: a % ring that opens a dropdown
// listing what's left to complete, each linking straight to its fix.
function MiniRing({ pct, complete }) {
    const r = 15;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
    return (
        <div className="relative h-9 w-9" data-testid="account-health-ring">
            <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
                <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(14,77,82,0.15)" strokeWidth="4" />
                <circle
                    cx="20" cy="20" r={r} fill="none"
                    stroke={complete ? "#425F47" : "#A5512B"}
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 700ms ease" }}
                />
            </svg>
            <span
                className="absolute inset-0 flex items-center justify-center text-[10px] font-heading tabular-nums text-primary-k"
                data-testid="account-health-score"
            >
                {pct}%
            </span>
        </div>
    );
}

export default function AccountHealthMenu() {
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        let cancelled = false;
        api.get("/account/health")
            .then(({ data }) => { if (!cancelled) setData(data); })
            .catch(() => { if (!cancelled) setData(null); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    if (!data) return null;
    const outstanding = (data.items || []).filter((i) => !i.done);
    const done = (data.items || []).filter((i) => i.done);
    const complete = data.complete;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                data-testid="account-health-toggle"
                title={complete ? "Account complete" : `${data.outstanding_count} thing${data.outstanding_count === 1 ? "" : "s"} left to set up`}
                className="relative flex items-center rounded-full hover:bg-surface-2 transition-colors p-0.5"
                aria-label="Account health"
            >
                <MiniRing pct={data.score_pct} complete={complete} />
                {!complete && data.outstanding_count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-terracotta text-white text-[9px] font-semibold flex items-center justify-center" data-testid="account-health-badge">
                        {data.outstanding_count}
                    </span>
                )}
            </button>

            {open && (
                <div
                    className="absolute right-0 mt-2 w-80 max-w-[92vw] rounded-2xl border border-kindred bg-surface shadow-xl overflow-hidden z-50"
                    data-testid="account-health-menu"
                >
                    <div className="px-4 py-4 bg-[linear-gradient(120deg,#0E4D52,#0A3E42)] text-white flex items-center gap-3">
                        <MiniRingWhite pct={data.score_pct} complete={complete} />
                        <div className="min-w-0">
                            <div className="font-heading text-base leading-tight text-white">
                                {complete ? "Your account is all set" : "Finish setting up"}
                            </div>
                            <div className="text-xs text-white/80 mt-0.5">
                                {complete
                                    ? "Everything Wayly needs is in place."
                                    : `${data.outstanding_count} left for the most accurate results.`}
                            </div>
                        </div>
                    </div>

                    {!complete && (
                        <ul className="divide-y divide-kindred max-h-[50vh] overflow-y-auto" data-testid="account-health-list">
                            {outstanding.map((item) => (
                                <li key={item.id}>
                                    <Link
                                        to={item.fix_route}
                                        onClick={() => setOpen(false)}
                                        data-testid={`account-health-item-${item.id}`}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
                                    >
                                        <span className="h-8 w-8 flex-none rounded-full bg-clay/15 text-clay flex items-center justify-center">
                                            <ArrowRight className="h-4 w-4" />
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm text-primary-k leading-snug">{item.label}</span>
                                            <span className="block text-xs font-semibold text-clay">{item.fix_label} →</span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}

                    {done.length > 0 && (
                        <ul className="divide-y divide-kindred bg-surface-2/40">
                            {done.map((item) => (
                                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 opacity-70" data-testid={`account-health-item-${item.id}`}>
                                    <span className="h-7 w-7 flex-none rounded-full bg-sage/15 text-sage flex items-center justify-center">
                                        <CheckCircle2 className="h-4 w-4" />
                                    </span>
                                    <span className="flex-1 min-w-0 text-sm text-muted-k line-through">{item.label}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {complete && (
                        <div className="px-4 py-5 flex items-center gap-2 text-sage" data-testid="account-health-complete">
                            <ShieldCheck className="h-5 w-5" />
                            <span className="text-sm">Nothing left to do.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function MiniRingWhite({ pct, complete }) {
    const r = 17;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
    return (
        <div className="relative h-11 w-11 flex-none">
            <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
                <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
                <circle
                    cx="22" cy="22" r={r} fill="none"
                    stroke={complete ? "#A8C7AB" : "#E8A15C"}
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 700ms ease" }}
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-heading tabular-nums text-white">{pct}%</span>
        </div>
    );
}
