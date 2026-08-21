import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatAUD2 } from "@/lib/api";
import { FileText, Archive, Download, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import useInvalidateOnParticipantChange from "@/hooks/useInvalidateOnParticipantChange";
import StatementFilters from "@/components/statements/StatementFilters";
import StatementStatusBadge from "@/components/statements/StatementStatusBadge";
import {
    periodCompact,
    periodExact,
    periodSortKey,
    providerName,
    grossTotal,
    closingBalance,
    decodeStatus,
    flagsCount,
    uploadedLabel,
} from "@/lib/statementFields";
import { downloadStatementsCsv } from "@/lib/statementsCsvExport";
import { toast } from "sonner";
import PageIntro from "@/components/PageIntro";
import SmartAISummary from "@/components/SmartAISummary";

const PAGE_SIZE = 25;

const SORT_KEYS = {
    period: { label: "Period", accessor: periodSortKey, numeric: true },
    provider: { label: "Provider", accessor: (s) => providerName(s).toLowerCase() },
    uploaded: { label: "Uploaded", accessor: (s) => new Date(s.uploaded_at || 0).getTime(), numeric: true },
    gross: { label: "Gross total", accessor: (s) => grossTotal(s) || 0, numeric: true },
    closing: { label: "Closing balance", accessor: (s) => closingBalance(s) ?? 0, numeric: true },
};

function periodMatches(stmt, period) {
    if (!period || period === "all") return true;
    const ex = stmt?.extracted_json || {};
    const endRaw = ex.period_end || ex.statement_period_end || stmt.uploaded_at;
    const end = endRaw ? new Date(endRaw) : null;
    if (!end || Number.isNaN(end.getTime())) return true;
    const now = new Date();
    if (period === "last_6m") {
        const cut = new Date(now); cut.setMonth(now.getMonth() - 6);
        return end >= cut;
    }
    if (period === "last_12m") {
        const cut = new Date(now); cut.setMonth(now.getMonth() - 12);
        return end >= cut;
    }
    if (period === "this_quarter") {
        const q = Math.floor(now.getMonth() / 3);
        const start = new Date(now.getFullYear(), q * 3, 1);
        return end >= start;
    }
    return true;
}

export default function StatementsList() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    const [archivedCount, setArchivedCount] = useState(0);
    const [searchParams, setSearchParams] = useSearchParams();
    const searchInputRef = useRef(null);

    // Filter state (URL-backed for shareable views)
    const [search, setSearch] = useState(searchParams.get("q") || "");
    const [debouncedSearch, setDebouncedSearch] = useState(search);
    const [selectedProviders, setSelectedProviders] = useState(
        (searchParams.get("providers") || "").split(",").filter(Boolean)
    );
    const [period, setPeriod] = useState(searchParams.get("period") || "all");
    const [statuses, setStatuses] = useState(
        (searchParams.get("status") || "").split(",").filter(Boolean)
    );
    const [sortKey, setSortKey] = useState(searchParams.get("sortKey") || "period");
    const [sortDir, setSortDir] = useState(searchParams.get("sortDir") || "desc");
    const [page, setPage] = useState(1);

    // Debounce search 250ms
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 250);
        return () => clearTimeout(t);
    }, [search]);

    // URL persistence
    useEffect(() => {
        const p = new URLSearchParams();
        if (debouncedSearch) p.set("q", debouncedSearch);
        if (selectedProviders.length) p.set("providers", selectedProviders.join(","));
        if (period && period !== "all") p.set("period", period);
        if (statuses.length) p.set("status", statuses.join(","));
        if (sortKey !== "period" || sortDir !== "desc") {
            p.set("sortKey", sortKey);
            p.set("sortDir", sortDir);
        }
        setSearchParams(p, { replace: true });
        setPage(1); // reset on any filter/sort change
    }, [debouncedSearch, selectedProviders, period, statuses, sortKey, sortDir, setSearchParams]);

    // Load
    const load = useCallback(async () => {
        setLoading(true);
        setErrored(false);
        try {
            const { data } = await api.get("/statements");
            setItems(Array.isArray(data) ? data : []);
        } catch {
            setErrored(true);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useInvalidateOnParticipantChange(() => { setItems([]); load(); });

    // Archived count (best-effort, non-blocking)
    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/statements/archived");
                const rows = Array.isArray(data) ? data : (data?.items || []);
                setArchivedCount(rows.length || 0);
            } catch {
                setArchivedCount(0);
            }
        })();
    }, []);

    // Keyboard shortcut: "/" focuses search
    useEffect(() => {
        function onKey(e) {
            if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
                e.preventDefault();
                searchInputRef.current?.focus?.();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const providers = useMemo(() => {
        const set = new Set();
        items.forEach((s) => {
            const p = providerName(s);
            if (p && p !== "Unknown provider") set.add(p);
        });
        return Array.from(set).sort();
    }, [items]);

    const filtered = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        return items.filter((s) => {
            if (q) {
                const haystack = [
                    providerName(s),
                    s.filename || "",
                    s.period_label || "",
                    periodCompact(s),
                    s.has_note ? "note" : "",
                ].join(" ").toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            if (selectedProviders.length > 0 && !selectedProviders.includes(providerName(s))) return false;
            if (!periodMatches(s, period)) return false;
            if (statuses.length > 0 && !statuses.includes(decodeStatus(s))) return false;
            return true;
        });
    }, [items, debouncedSearch, selectedProviders, period, statuses]);

    const sorted = useMemo(() => {
        const accessor = SORT_KEYS[sortKey]?.accessor || SORT_KEYS.period.accessor;
        const arr = [...filtered];
        arr.sort((a, b) => {
            const av = accessor(a);
            const bv = accessor(b);
            if (av < bv) return sortDir === "asc" ? -1 : 1;
            if (av > bv) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
        return arr;
    }, [filtered, sortKey, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageStart = (page - 1) * PAGE_SIZE;
    const pageRows = sorted.slice(pageStart, pageStart + PAGE_SIZE);

    const cycleSort = useCallback((key) => {
        // Header click: sort desc → asc → reset (default period desc)
        if (sortKey === key) {
            if (sortDir === "desc") setSortDir("asc");
            else if (sortDir === "asc") { setSortKey("period"); setSortDir("desc"); }
        } else {
            setSortKey(key);
            setSortDir(key === "provider" ? "asc" : "desc");
        }
    }, [sortKey, sortDir]);

    const clearAll = () => {
        setSearch(""); setSelectedProviders([]); setPeriod("all"); setStatuses([]);
    };

    const onExportCsv = () => {
        if (sorted.length === 0) {
            toast.error("No statements to export in the current view.");
            return;
        }
        downloadStatementsCsv(sorted);
        toast.success(`Exported ${sorted.length} statement${sorted.length === 1 ? "" : "s"}.`);
    };

    return (
        <div className="space-y-6" data-testid="statements-list-page">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <PageIntro
                    eyebrow="All Statements"
                    title="Your Support at Home Statements"
                    description="Every monthly statement your provider has sent, uploaded and decoded into plain English so nothing surprises you."
                    whatItDoes="Stores each PDF, extracts every line item, and highlights anything unusual so you can query it before the next payment."
                    howToUse={[
                        "Upload a new monthly statement using the button.",
                        "Open a statement to see the plain-English decode and flags.",
                        "Compare two statements side-by-side to spot creeping charges.",
                        "Archive statements once you've reviewed them.",
                    ]}
                    whatYouGet={[
                        "Peace of mind that every dollar is accounted for.",
                        "A searchable ledger of provider spend over time.",
                        "An audit trail if you ever need to escalate a dispute.",
                    ]}
                    className="flex-1 min-w-0"
                />
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={onExportCsv}
                        disabled={sorted.length === 0}
                        className="inline-flex items-center gap-2 text-sm border border-kindred rounded-full px-4 py-2 text-primary-k hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        data-testid="statements-export-csv-btn"
                        title="Export the current filtered/sorted view as CSV"
                    >
                        <Download className="h-3.5 w-3.5" /> Export CSV
                    </button>
                    <Link
                        to="/app/statements/archived"
                        data-testid="statements-archived-link"
                        className="inline-flex items-center gap-2 text-sm border border-kindred rounded-full px-4 py-2 text-primary-k hover:bg-surface-2"
                    >
                        <Archive className="h-3.5 w-3.5" /> Archived
                        {archivedCount > 0 && <span className="tabular-nums text-xs text-muted-k">({archivedCount})</span>}
                    </Link>
                    <Link
                        to="/app/statements/upload"
                        data-testid="statements-upload-cta"
                        className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90"
                    >
                        <FileText className="h-4 w-4" /> Upload statement
                    </Link>
                </div>
            </div>

            {items.length > 0 && !loading && (
                <SmartAISummary
                    pageKey="statements-list"
                    context={{
                        total_statements: items.length,
                        filtered_count: sorted.length,
                        providers: providers.slice(0, 6),
                        latest_provider: sorted[0] ? providerName(sorted[0]) : null,
                        latest_period: sorted[0] ? periodExact(sorted[0]) : null,
                        latest_gross_aud: sorted[0] ? grossTotal(sorted[0]) : null,
                        archived_count: archivedCount,
                        anomaly_flagged: sorted.filter((s) => flagsCount(s) > 0).length,
                    }}
                />
            )}

            <div ref={searchInputRef}>
                <StatementFilters
                    search={search}
                    onSearchChange={setSearch}
                    providers={providers}
                    selectedProviders={selectedProviders}
                    onProvidersChange={setSelectedProviders}
                    period={period}
                    onPeriodChange={setPeriod}
                    statuses={statuses}
                    onStatusesChange={setStatuses}
                    onClearAll={clearAll}
                    resultCount={sorted.length}
                    totalCount={items.length}
                />
            </div>

            {/* Table / states */}
            {loading ? (
                <ul className="bg-surface border border-kindred rounded-xl divide-y divide-[var(--kindred-border)] overflow-hidden">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <li key={i} className="px-6 py-5 flex items-center justify-between">
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-surface-2 rounded w-56 animate-pulse" />
                                <div className="h-3 bg-surface-2 rounded w-40 animate-pulse" />
                            </div>
                            <div className="h-6 w-16 bg-surface-2 rounded-full animate-pulse" />
                        </li>
                    ))}
                </ul>
            ) : errored ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center" data-testid="statements-error-state">
                    <AlertCircle className="h-8 w-8 text-terracotta mx-auto" />
                    <p className="mt-3 text-primary-k">We couldn&apos;t load your statements.</p>
                    <button
                        type="button"
                        onClick={load}
                        className="mt-4 inline-block text-primary-k underline hover:no-underline"
                        data-testid="statements-retry-btn"
                    >
                        Retry
                    </button>
                </div>
            ) : items.length === 0 ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center" data-testid="statements-empty-state">
                    <FileText className="h-8 w-8 text-muted-k mx-auto" />
                    <p className="mt-3 text-muted-k">No statements yet.</p>
                    <Link
                        to="/app/statements/upload"
                        className="mt-4 inline-block bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90"
                    >
                        Upload your first statement
                    </Link>
                </div>
            ) : sorted.length === 0 ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center" data-testid="statements-no-results">
                    <p className="text-muted-k">No statements match these filters.</p>
                    <button
                        type="button"
                        onClick={clearAll}
                        className="mt-3 inline-block text-primary-k underline hover:no-underline"
                        data-testid="statements-no-results-clear"
                    >
                        Clear filters
                    </button>
                </div>
            ) : (
                <>
                <div className="bg-surface border border-kindred rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="statements-table">
                            <thead className="bg-surface-2 text-muted-k text-xs uppercase tracking-wider">
                                <tr>
                                    <th colSpan={6} className="p-0">
                                        <div
                                            className="grid items-center gap-4 px-6 py-3 min-w-[720px]"
                                            style={{ gridTemplateColumns: "1.5fr 1.1fr 0.9fr 0.9fr 1fr 0.9fr" }}
                                        >
                                            <SortHeader label="Period" k="period" sortKey={sortKey} sortDir={sortDir} onSort={cycleSort} testid="th-period" cellless />
                                            <SortHeader label="Provider" k="provider" sortKey={sortKey} sortDir={sortDir} onSort={cycleSort} testid="th-provider" cellless />
                                            <SortHeader label="Uploaded" k="uploaded" sortKey={sortKey} sortDir={sortDir} onSort={cycleSort} testid="th-uploaded" cellless />
                                            <SortHeader label="Gross total" k="gross" sortKey={sortKey} sortDir={sortDir} onSort={cycleSort} testid="th-gross" align="right" cellless />
                                            <SortHeader label="Closing balance" k="closing" sortKey={sortKey} sortDir={sortDir} onSort={cycleSort} testid="th-closing" align="right" cellless />
                                            <div className="font-medium text-left" data-testid="th-status">Status</div>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map((s) => {
                                    const status = decodeStatus(s);
                                    const gross = grossTotal(s);
                                    const closing = closingBalance(s);
                                    const prov = providerName(s);
                                    return (
                                        <tr
                                            key={s.id}
                                            className="border-t border-kindred hover:bg-primary-k/[0.03] focus-within:bg-primary-k/[0.03] transition-colors group"
                                            style={{ height: 56 }}
                                        >
                                            <td colSpan={6} className="p-0">
                                                <Link
                                                    to={`/app/statements/${s.id}`}
                                                    data-testid={`statement-row-${s.id}`}
                                                    className="grid items-center gap-4 px-6 py-3 min-w-[720px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k focus-visible:ring-offset-2 rounded"
                                                    style={{ gridTemplateColumns: "1.5fr 1.1fr 0.9fr 0.9fr 1fr 0.9fr" }}
                                                >
                                                    <div className="text-primary-k" title={periodExact(s)}>{periodCompact(s)}</div>
                                                    <div className="text-primary-k truncate" title={prov}>
                                                        {prov.length > 28 ? `${prov.slice(0, 27)}…` : prov}
                                                    </div>
                                                    <div className="text-muted-k">{uploadedLabel(s.uploaded_at)}</div>
                                                    <div className="text-primary-k text-right font-mono tabular-nums">{formatAUD2(gross)}</div>
                                                    <div className={`text-right font-mono tabular-nums ${closing == null ? "text-muted-k" : "text-primary-k"}`}>
                                                        {closing == null ? "," : formatAUD2(closing)}
                                                    </div>
                                                    <div>
                                                        <StatementStatusBadge
                                                            status={status}
                                                            flagsCount={flagsCount(s)}
                                                            hasNote={!!s.has_note}
                                                            testid={`statement-status-${s.id}`}
                                                        />
                                                    </div>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {sorted.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between text-xs text-muted-k">
                        <div data-testid="statements-page-info">
                            Showing {pageStart + 1},{Math.min(pageStart + PAGE_SIZE, sorted.length)} of {sorted.length}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="border border-kindred rounded-full px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
                                data-testid="statements-prev-page"
                            >
                                Prev
                            </button>
                            <span className="tabular-nums">Page {page} of {totalPages}</span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="border border-kindred rounded-full px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
                                data-testid="statements-next-page"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
                </>
            )}
        </div>
    );
}

function SortHeader({ label, k, sortKey, sortDir, onSort, testid, align = "left", cellless = false }) {
    const active = sortKey === k;
    const button = (
        <button
            type="button"
            onClick={() => onSort(k)}
            className={`inline-flex items-center gap-1 uppercase tracking-wider text-xs font-medium ${active ? "text-primary-k" : "text-muted-k"} hover:text-primary-k`}
            data-testid={testid}
            aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
            {label}
            {active && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />)}
        </button>
    );
    // `cellless` mode is used when the header row wraps a colspan grid so
    // that this element sits inside a <div> rather than as its own <th>.
    if (cellless) {
        return (
            <div className={`font-medium ${align === "right" ? "text-right" : "text-left"} whitespace-nowrap`}>
                {button}
            </div>
        );
    }
    return (
        <th
            className={`px-6 py-3 font-medium ${align === "right" ? "text-right" : "text-left"} whitespace-nowrap`}
        >
            {button}
        </th>
    );
}
