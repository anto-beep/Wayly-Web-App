import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CheckCircle2, ChevronDown, ArrowRight, ShieldCheck } from "lucide-react";

// Circular progress ring — teal track, clay progress, big readable % in the middle.
function Ring({ pct }) {
    const r = 34;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
    const done = pct >= 100;
    return (
        <div className="relative h-[92px] w-[92px] flex-none" data-testid="account-health-ring">
            <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
                <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" />
                <circle
                    cx="40" cy="40" r={r} fill="none"
                    stroke={done ? "#6B8F71" : "#E8A15C"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 700ms ease" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <span className="font-heading text-xl leading-none tabular-nums" style={{ color: "#fff" }} data-testid="account-health-score">{pct}%</span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.75)" }}>done</span>
            </div>
        </div>
    );
}

export default function AccountHealthCard() {
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.get("/account/health")
            .then(({ data }) => {
                if (cancelled) return;
                setData(data);
                // Weekly in-app nudge if setup is still incomplete (at most once / 7 days).
                if (!data.complete) {
                    const KEY = "wayly_health_nudge_ts";
                    const last = Number(localStorage.getItem(KEY) || 0);
                    if (Date.now() - last > 7 * 24 * 60 * 60 * 1000) {
                        localStorage.setItem(KEY, String(Date.now()));
                        toast.info(`You still have ${data.outstanding_count} thing${data.outstanding_count === 1 ? "" : "s"} to finish setting up your account.`, {
                            description: "Completing these gives you the most accurate results.",
                        });
                    }
                }
            })
            .catch(() => { if (!cancelled) setData(null); });
        return () => { cancelled = true; };
    }, []);

    if (!data) return null;
    const outstanding = (data.items || []).filter((i) => !i.done);
    const complete = data.complete;

    return (
        <section
            data-testid="account-health-card"
            className="rounded-2xl overflow-hidden border border-kindred shadow-sm"
        >
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                data-testid="account-health-toggle"
                className="w-full flex items-center gap-4 px-5 py-5 text-left bg-[linear-gradient(120deg,#0E4D52,#0A3E42)]"
            >
                <Ring pct={data.score_pct} />
                <div className="flex-1 min-w-0 text-white">
                    <div className="font-heading text-xl leading-tight" style={{ color: "#fff" }}>
                        {complete ? "Your account is all set" : "Finish setting up your account"}
                    </div>
                    <div className="text-sm text-white/75 mt-1">
                        {complete
                            ? "Every detail Wayly needs is in place."
                            : `${data.outstanding_count} thing${data.outstanding_count === 1 ? "" : "s"} left to complete for the most accurate results.`}
                    </div>
                </div>
                {!complete && (
                    <span className="flex-none inline-flex items-center gap-1.5 rounded-full bg-[#E8A15C] text-[#0E2A47] px-4 py-2 text-sm font-semibold">
                        {open ? "Hide" : "Show"}
                        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                    </span>
                )}
                {complete && <ShieldCheck className="h-7 w-7 text-[#A8C7AB] flex-none" />}
            </button>

            {open && !complete && (
                <ul className="bg-surface divide-y divide-kindred" data-testid="account-health-list">
                    {outstanding.map((item) => (
                        <li key={item.id}>
                            <Link
                                to={item.fix_route}
                                data-testid={`account-health-item-${item.id}`}
                                className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2 transition-colors"
                            >
                                <span className="h-8 w-8 flex-none rounded-full bg-gold/15 text-gold flex items-center justify-center">
                                    <ArrowRight className="h-4 w-4" />
                                </span>
                                <span className="flex-1 min-w-0 text-sm text-primary-k">{item.label}</span>
                                <span className="flex-none text-xs font-semibold text-primary-k underline">{item.fix_label}</span>
                            </Link>
                        </li>
                    ))}
                    {(data.items || []).filter((i) => i.done).map((item) => (
                        <li key={item.id} className="flex items-center gap-3 px-5 py-3 opacity-60" data-testid={`account-health-item-${item.id}`}>
                            <span className="h-8 w-8 flex-none rounded-full bg-sage/15 text-sage flex items-center justify-center">
                                <CheckCircle2 className="h-4 w-4" />
                            </span>
                            <span className="flex-1 min-w-0 text-sm text-muted-k line-through">{item.label}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
