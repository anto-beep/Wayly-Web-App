import React from "react";
import { Search, X } from "lucide-react";

// STMT-UI-1 v2 · Phase 1, Register filter bar.
// Filters are AND-combined; a "Clear filters" chip appears when any are active.
// Live result count on the right stays visible at all times.

const PERIOD_OPTIONS = [
    { value: "all", label: "All time" },
    { value: "this_quarter", label: "This quarter" },
    { value: "last_6m", label: "Last 6 months" },
    { value: "last_12m", label: "Last 12 months" },
];

const STATUS_OPTIONS = [
    { value: "clean", label: "Clean" },
    { value: "flagged", label: "Flagged" },
    { value: "processing", label: "Processing" },
    { value: "failed", label: "Failed" },
];

function MultiSelect({ label, options, values, onChange, testid }) {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef(null);
    React.useEffect(() => {
        function onDown(e) {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);
    const summary = values.length === 0 ? label : `${label} · ${values.length}`;
    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 text-sm border rounded-full px-3 py-1.5 transition-colors ${values.length > 0 ? "border-primary-k bg-primary-k/5 text-primary-k" : "border-kindred text-primary-k hover:bg-surface-2"}`}
                data-testid={testid}
                aria-expanded={open}
            >
                {summary}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            {open && (
                <div className="absolute z-30 mt-2 min-w-[220px] bg-surface border border-kindred rounded-lg shadow-lg p-2" role="listbox">
                    {options.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-k">No options.</div>
                    ) : options.map((opt) => {
                        const checked = values.includes(opt.value);
                        return (
                            <label
                                key={opt.value}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2 cursor-pointer text-sm text-primary-k"
                                data-testid={`${testid}-option-${opt.value}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                        const next = checked
                                            ? values.filter((v) => v !== opt.value)
                                            : [...values, opt.value];
                                        onChange(next);
                                    }}
                                    className="accent-primary-k"
                                />
                                <span>{opt.label}</span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function SingleSelect({ label, options, value, onChange, testid }) {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef(null);
    React.useEffect(() => {
        function onDown(e) {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);
    const active = value !== "all";
    const current = options.find((o) => o.value === value);
    const summary = active && current ? `${label} · ${current.label}` : label;
    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 text-sm border rounded-full px-3 py-1.5 transition-colors ${active ? "border-primary-k bg-primary-k/5 text-primary-k" : "border-kindred text-primary-k hover:bg-surface-2"}`}
                data-testid={testid}
                aria-expanded={open}
            >
                {summary}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            {open && (
                <div className="absolute z-30 mt-2 min-w-[200px] bg-surface border border-kindred rounded-lg shadow-lg p-2" role="listbox">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`flex w-full items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2 text-sm text-left ${opt.value === value ? "bg-surface-2 text-primary-k font-medium" : "text-primary-k"}`}
                            data-testid={`${testid}-option-${opt.value}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function StatementFilters({
    search,
    onSearchChange,
    providers,           // full list of unique providers for the household
    selectedProviders,
    onProvidersChange,
    period,
    onPeriodChange,
    statuses,
    onStatusesChange,
    onClearAll,
    resultCount,
    totalCount,
}) {
    const hasAnyFilter =
        (search || "").trim() !== "" ||
        selectedProviders.length > 0 ||
        (period && period !== "all") ||
        statuses.length > 0;

    return (
        <div className="flex flex-wrap items-center gap-2" data-testid="statements-filter-bar">
            <div className="relative">
                <Search className="h-4 w-4 text-muted-k absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search provider, filename, note…"
                    className="pl-9 pr-8 py-1.5 text-sm rounded-full border border-kindred bg-surface min-w-[240px] focus:outline-none focus:border-primary-k focus:ring-2 focus:ring-primary-k/20"
                    data-testid="statements-search-input"
                    aria-label="Search statements"
                />
                {search && (
                    <button
                        type="button"
                        onClick={() => onSearchChange("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-2 text-muted-k"
                        aria-label="Clear search"
                        data-testid="statements-search-clear"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            <MultiSelect
                label="Provider"
                options={providers.map((p) => ({ value: p, label: p }))}
                values={selectedProviders}
                onChange={onProvidersChange}
                testid="statements-provider-filter"
            />

            <SingleSelect
                label="Period"
                options={PERIOD_OPTIONS}
                value={period}
                onChange={onPeriodChange}
                testid="statements-period-filter"
            />

            <MultiSelect
                label="Status"
                options={STATUS_OPTIONS}
                values={statuses}
                onChange={onStatusesChange}
                testid="statements-status-filter"
            />

            {hasAnyFilter && (
                <button
                    type="button"
                    onClick={onClearAll}
                    className="inline-flex items-center gap-1 text-sm text-primary-k underline hover:no-underline px-2 py-1.5"
                    data-testid="statements-clear-filters"
                >
                    Clear filters
                </button>
            )}

            <div className="ml-auto text-xs text-muted-k tabular-nums" data-testid="statements-result-count">
                {resultCount === totalCount ? `${resultCount} shown` : `${resultCount} of ${totalCount} shown`}
            </div>
        </div>
    );
}
