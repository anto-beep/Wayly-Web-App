import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, CornerDownLeft } from "lucide-react";
import {
    DASHBOARD_QUICK_ACTIONS,
    searchDestinations,
} from "@/config/dashboardDestinations";

/**
 * DashboardActionBar — "What would you like to do?"
 *
 * A calm, high-contrast navigator that sits near the top of the dashboard.
 * Caregivers can either type what they want (search jumps to the right tool or
 * page) or tap one of the large clay shortcut tiles for the most common tasks.
 * Designed for older users: big targets, plain labels, one clear question.
 */
export default function DashboardActionBar() {
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(false);
    const blurTimer = useRef(null);

    const results = useMemo(() => searchDestinations(query), [query]);
    const showResults = focused && query.trim().length > 0;

    const go = (route) => {
        setQuery("");
        setFocused(false);
        navigate(route);
    };

    const onSubmit = (e) => {
        e.preventDefault();
        if (results.length > 0) go(results[0].route);
    };

    return (
        <section
            data-testid="dashboard-action-bar"
            className="rounded-2xl border-2 border-gold/30 bg-gradient-to-br from-gold/[0.08] via-surface to-surface p-6 sm:p-7"
        >
            {/* Search */}
            <form onSubmit={onSubmit} className="relative" role="search">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gold" aria-hidden="true" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setFocused(true); }}
                        onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150); }}
                        placeholder="Try 'check my invoice' or 'draft a letter'"
                        data-testid="dashboard-action-search"
                        aria-label="Search for a tool or page"
                        className="w-full rounded-pill border-2 border-kindred bg-white pl-12 pr-4 py-3.5 text-[1.05rem] text-primary-k placeholder:text-muted-k/70 focus:border-gold focus:outline-none transition-colors"
                    />
                </div>

                {showResults && (
                    <div
                        data-testid="dashboard-action-results"
                        className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-kindred bg-white shadow-card-lift"
                    >
                        {results.length === 0 ? (
                            <div className="px-4 py-4 text-sm text-muted-k">
                                No match. Try words like “invoice”, “budget”, “letter” or “provider”.
                            </div>
                        ) : (
                            <ul>
                                {results.map((d, i) => {
                                    const Icon = d.icon;
                                    return (
                                        <li key={d.route}>
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => go(d.route)}
                                                data-testid={`dashboard-action-result-${i}`}
                                                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
                                            >
                                                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold/15 text-gold">
                                                    <Icon className="h-5 w-5" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-semibold text-primary-k">{d.label}</span>
                                                    <span className="block text-xs text-muted-k truncate">{d.hint}</span>
                                                </span>
                                                {i === 0 ? (
                                                    <CornerDownLeft className="h-4 w-4 flex-none text-muted-k/60" aria-hidden="true" />
                                                ) : (
                                                    <ArrowRight className="h-4 w-4 flex-none text-muted-k/60" aria-hidden="true" />
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </form>

            {/* Shortcut grid */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="dashboard-quick-actions">
                {DASHBOARD_QUICK_ACTIONS.map((a, i) => {
                    const Icon = a.icon;
                    const accents = ["#0E4D52", "#A5512B", "#3E6A4C", "#0B3B3E", "#B5623A", "#2E5540"];
                    const accent = accents[i % accents.length];
                    return (
                        <button
                            key={a.route}
                            type="button"
                            onClick={() => go(a.route)}
                            data-testid={`dashboard-quick-${a.route}`}
                            className="group flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left shadow-sm hover:shadow-card transition-colors min-h-[112px]"
                            style={{ backgroundColor: `${accent}12`, borderColor: `${accent}33` }}
                        >
                            <span className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform group-" style={{ backgroundColor: accent }}>
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-primary-k leading-tight">{a.label}</span>
                                <span className="mt-0.5 block text-xs text-muted-k leading-snug">{a.hint}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
