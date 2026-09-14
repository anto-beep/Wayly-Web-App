/**
 * OJ-1 v1.1, dashboard nudge that pushes new users into the guided
 * walkthrough. Renders only when there's an in-progress journey (or when
 * the user has no journey at all and we're eligible to create one).
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowRight, Compass, X } from "lucide-react";

const DISMISS_KEY = "wayly:oj1:banner:dismissed";

export default function JourneyStartBanner() {
    const [state, setState] = useState({ show: false, resume: false, journeyId: null });
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
    });

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await api.get("/journeys/current?include_completed=1");
                if (!alive) return;
                const j = res?.data?.journey;
                if (!j) {
                    // No journey record → offer to start one.
                    setState({ show: true, resume: false, journeyId: null });
                    return;
                }
                if (j.status === "in_progress") {
                    setState({ show: true, resume: true, journeyId: j.id });
                }
                // completed / abandoned → hide (envelope tile handles completed)
            } catch { /* silent */ }
        })();
        return () => { alive = false; };
    }, []);

    if (dismissed || !state.show) return null;

    return (
        <aside
            className="relative overflow-hidden rounded-2xl border-2 border-wayly-clay-400/60 bg-gradient-to-br from-wayly-clay-50 via-white to-wayly-gold/10 p-6 sm:p-7 flex items-start gap-5 shadow-md ring-1 ring-wayly-clay-400/20"
            data-testid="oj1-journey-start-banner"
            data-mode={state.resume ? "resume" : "start"}
        >
            {/* Left accent stripe */}
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-wayly-clay-500 to-wayly-clay-400" />
            <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-wayly-clay-500 text-white shrink-0 shadow-sm ring-2 ring-wayly-clay-50">
                <Compass className="h-6 w-6" aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-wayly-clay-500 text-white text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 font-semibold">
                        {state.resume ? "Continue" : "Get started"}
                    </span>
                    <span className="text-[11px] text-muted-k uppercase tracking-wider">~15 min · 4 stops</span>
                </div>
                <h3 className="mt-2 font-heading text-xl sm:text-2xl text-primary-k tracking-tight leading-snug">
                    {state.resume ? "Pick up where you left off." : "New to Wayly? Take the guided walk-through."}
                </h3>
                <p className="mt-2 text-sm sm:text-base text-primary-k/85 leading-relaxed max-w-2xl">
                    {state.resume
                        ? "You started the guided walkthrough. Four short stops and you're done, nothing you did before is lost."
                        : "Four short stops that sequence the tools you actually need. About fifteen minutes end-to-end."}
                </p>
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                    <Link
                        to="/journey"
                        className="inline-flex items-center gap-2 rounded-full bg-wayly-clay-500 text-white px-5 py-2.5 text-sm font-semibold hover:bg-wayly-clay-600 shadow-md transition"
                        data-testid="oj1-journey-start-cta"
                    >
                        {state.resume ? "Resume the walk-through" : "Start the walk-through"}
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <span className="text-xs text-muted-k">Skippable · progress saved</span>
                </div>
            </div>
            <button
                type="button"
                onClick={() => {
                    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
                    setDismissed(true);
                }}
                className="relative shrink-0 text-muted-k hover:text-primary-k transition"
                aria-label="Dismiss the onboarding walk-through banner"
                data-testid="oj1-journey-start-dismiss"
            >
                <X className="h-4 w-4" />
            </button>
        </aside>
    );
}
