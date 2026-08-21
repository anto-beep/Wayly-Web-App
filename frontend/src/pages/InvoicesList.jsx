/**
 * InvoicesList
 *
 * Route: /app/invoices
 *
 * Sibling to StatementsList. Lists every invoice the caregiver has
 * checked, with the same visual language: header, PageIntro, Smart AI
 * Summary, filters, and a horizontally-scrollable table.
 *
 * Backed by GET /api/invoices (returns items with document_shape,
 * reconciliation.findings, provider_name, invoice_date, and
 * checks_status). Clicking a row navigates to /app/invoices/{id}.
 */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, formatAUD2 } from "@/lib/api";
import { FileText, Upload, AlertCircle, ChevronUp, ChevronDown, Receipt, Download } from "lucide-react";
import { toast } from "sonner";
import PageIntro from "@/components/PageIntro";
import SmartAISummary from "@/components/SmartAISummary";
import InvoiceFilters from "@/components/invoices/InvoiceFilters";

// Escapes a single CSV field. Wraps in quotes and doubles inner quotes to
// keep spreadsheets happy on commas and multi-line narratives.
function csvField(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}
function downloadInvoicesCsv(rows) {
    const header = [
        "Invoice date", "Provider", "Invoice number", "Uploaded",
        "Amount billed (AUD)", "Refund owed (AUD)", "Findings",
        "Verdict", "Document shape", "Invoice ID",
    ];
    const lines = [header.map(csvField).join(",")];
    rows.forEach((inv) => {
        const total = invoiceTotal(inv);
        const refund = refundOwed(inv);
        lines.push([
            inv.invoice_date ? new Date(inv.invoice_date).toISOString().slice(0, 10) : "",
            inv.provider_name || "",
            inv.invoice_number || inv?.reconciliation?.invoice_number || "",
            inv.created_at ? new Date(inv.created_at).toISOString().slice(0, 10) : "",
            total ? total.toFixed(2) : "",
            refund ? refund.toFixed(2) : "0.00",
            findingCount(inv),
            verdictOf(inv),
            inv.document_shape || "",
            inv.id,
        ].map(csvField).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `wayly-invoices-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function invoiceTotal(inv) {
    const rec = inv?.reconciliation || {};
    if (rec.invoice_total != null) return Number(rec.invoice_total);
    // Fall back to sum of lines if the backend didn't set the aggregate.
    const lines = rec.lines || [];
    return lines.reduce((acc, l) => acc + (Number(l?.amount) || 0), 0);
}
function findingCount(inv) {
    return (inv?.reconciliation?.findings || []).length;
}
function refundOwed(inv) {
    return (inv?.reconciliation?.findings || []).reduce(
        (acc, f) => acc + (Number(f?.financial_impact?.amount) || 0),
        0
    );
}
function verdictOf(inv) {
    return inv?.reconciliation?.overall_verdict || (findingCount(inv) === 0 ? "all_clear" : "issues");
}
// Collapse the raw verdict into the four status-filter buckets used by the
// filter bar (mirrors the Statements status filter behaviour).
function statusKey(inv) {
    const v = String(verdictOf(inv)).toLowerCase();
    if (v === "all_clear" || (findingCount(inv) === 0)) return "all_clear";
    if (v === "watch") return "watch";
    if (v.includes("block") || v.includes("critical") || v.includes("check_before")) return "critical";
    return "issues";
}
function invoicePeriodMatches(inv, period) {
    if (!period || period === "all") return true;
    const raw = inv.invoice_date || inv.created_at;
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return true;
    const now = new Date();
    if (period === "last_6m") { const cut = new Date(now); cut.setMonth(now.getMonth() - 6); return d >= cut; }
    if (period === "last_12m") { const cut = new Date(now); cut.setMonth(now.getMonth() - 12); return d >= cut; }
    if (period === "this_quarter") { const q = Math.floor(now.getMonth() / 3); return d >= new Date(now.getFullYear(), q * 3, 1); }
    return true;
}
function verdictBadge(v) {
    const map = {
        all_clear: { label: "All clear", cls: "bg-sage-100 text-sage-800 border-sage-200" },
        watch: { label: "Watch", cls: "bg-gold-100 text-gold-800 border-gold-200" },
        issues: { label: "Issues", cls: "bg-gold-100 text-gold-800 border-gold-200" },
        blocker: { label: "Blocker", cls: "bg-terracotta-100 text-terracotta-800 border-terracotta-200" },
        critical: { label: "Critical", cls: "bg-terracotta-100 text-terracotta-800 border-terracotta-200" },
    };
    return map[v] || map.issues;
}
const SORT_KEYS = {
    date: { label: "Invoice date", accessor: (i) => new Date(i.invoice_date || i.created_at || 0).getTime(), numeric: true },
    provider: { label: "Provider", accessor: (i) => (i.provider_name || "").toLowerCase() },
    uploaded: { label: "Uploaded", accessor: (i) => new Date(i.created_at || 0).getTime(), numeric: true },
    total: { label: "Amount", accessor: invoiceTotal, numeric: true },
    findings: { label: "Findings", accessor: findingCount, numeric: true },
};

export default function InvoicesList() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    const [sortKey, setSortKey] = useState("date");
    const [sortDir, setSortDir] = useState("desc");

    // Filter state (mirrors StatementsList)
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedProviders, setSelectedProviders] = useState([]);
    const [period, setPeriod] = useState("all");
    const [statuses, setStatuses] = useState([]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 250);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        setErrored(false);
        try {
            const { data } = await api.get("/invoices");
            setItems(data?.items || []);
        } catch (e) {
            setErrored(true);
            toast.error("Could not load invoices.");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const providers = useMemo(() => {
        const set = new Set();
        items.forEach((i) => { if (i.provider_name) set.add(i.provider_name); });
        return Array.from(set).sort();
    }, [items]);

    const filtered = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        return items.filter((inv) => {
            if (q) {
                const haystack = [
                    inv.provider_name || "",
                    inv.invoice_number || inv?.reconciliation?.invoice_number || "",
                    inv.filename || "",
                ].join(" ").toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            if (selectedProviders.length > 0 && !selectedProviders.includes(inv.provider_name)) return false;
            if (!invoicePeriodMatches(inv, period)) return false;
            if (statuses.length > 0 && !statuses.includes(statusKey(inv))) return false;
            return true;
        });
    }, [items, debouncedSearch, selectedProviders, period, statuses]);

    const sorted = useMemo(() => {
        const key = SORT_KEYS[sortKey];
        if (!key) return filtered;
        const arr = [...filtered].sort((a, b) => {
            const va = key.accessor(a);
            const vb = key.accessor(b);
            if (key.numeric) return (Number(va) || 0) - (Number(vb) || 0);
            return String(va || "").localeCompare(String(vb || ""));
        });
        if (sortDir === "desc") arr.reverse();
        return arr;
    }, [filtered, sortKey, sortDir]);

    const clearAll = () => { setSearch(""); setSelectedProviders([]); setPeriod("all"); setStatuses([]); };

    const toggleSort = (k) => {
        if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else { setSortKey(k); setSortDir("desc"); }
    };

    const sortIndicator = (k) => sortKey !== k ? null : (sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />);

    const totals = useMemo(() => {
        const provs = new Set();
        let openIssues = 0;
        let refund = 0;
        items.forEach((i) => {
            if (i.provider_name) provs.add(i.provider_name);
            openIssues += findingCount(i);
            refund += refundOwed(i);
        });
        return { providers: Array.from(provs).slice(0, 6), openIssues, refund };
    }, [items]);

    return (
        <div className="space-y-6" data-testid="invoices-list-page">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <PageIntro
                    eyebrow="ALL INVOICES"
                    title="Your Support at Home Invoices"
                    description="Every invoice you have checked, with the issue count, refund owed and provider at a glance. Click any row to open the full checker output for that invoice."
                    whatItDoes="Groups your uploaded invoices so you can see refunds owed, issues per provider, and history in one place."
                    howToUse={[
                        "Upload a new invoice from the button on the right.",
                        "Sort by date, provider, amount or findings using the column headings.",
                        "Click a row to open the full Issue Register and refund breakdown for that invoice.",
                    ]}
                    whatYouGet={[
                        "A running total of potential refund across all invoices.",
                        "Per-provider issue history you can share with the family.",
                        "A permanent, private audit trail of everything checked.",
                    ]}
                />
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => {
                            if (sorted.length === 0) {
                                toast.error("No invoices to export yet.");
                                return;
                            }
                            downloadInvoicesCsv(sorted);
                            toast.success(`Exported ${sorted.length} invoice${sorted.length === 1 ? "" : "s"}.`);
                        }}
                        disabled={items.length === 0}
                        data-testid="invoices-list-export-csv-btn"
                        title="Export the current view as CSV"
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary-k/25 bg-white text-primary-k text-sm font-medium px-3.5 py-2 hover:bg-primary-k hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download className="h-3.5 w-3.5" /> Export CSV
                    </button>
                    <Link
                        to="/ai-tools/invoice-checker"
                        data-testid="invoices-list-upload-btn"
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white text-sm font-medium px-4 py-2 hover:bg-primary-k/90"
                    >
                        <Upload className="h-4 w-4" /> Check a new invoice
                    </Link>
                </div>
            </div>

            {items.length > 0 && !loading && (
                <SmartAISummary
                    pageKey="invoices-list"
                    context={{
                        total_invoices: items.length,
                        providers: totals.providers,
                        latest_provider: sorted[0]?.provider_name,
                        latest_amount_aud: sorted[0] ? invoiceTotal(sorted[0]) : null,
                        open_issue_count_total: totals.openIssues,
                        potential_refund_aud_total: Math.round(totals.refund * 100) / 100,
                    }}
                />
            )}

            {items.length > 0 && !loading && (
                <InvoiceFilters
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
            )}

            {errored ? (
                <div className="rounded-2xl border border-terracotta-200 bg-terracotta-50 p-4 text-sm text-charcoal inline-flex items-center gap-2" data-testid="invoices-list-error">
                    <AlertCircle className="h-4 w-4" /> Could not load invoices. Please refresh.
                </div>
            ) : loading ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 text-sm text-muted-k">Loading invoices…</div>
            ) : items.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-primary-k/20 bg-white p-10 text-center" data-testid="invoices-list-empty">
                    <Receipt className="h-10 w-10 text-primary-k/60 mx-auto" />
                    <h3 className="mt-3 font-heading text-xl text-primary-k">No invoices yet</h3>
                    <p className="mt-1.5 text-sm text-muted-k max-w-md mx-auto">
                        Upload the first invoice you were charged by your provider. We will read it, spot any errors, and tell you exactly what to do next.
                    </p>
                    <Link
                        to="/ai-tools/invoice-checker"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white text-sm font-medium px-4 py-2 hover:bg-primary-k/90"
                    >
                        <Upload className="h-4 w-4" /> Check your first invoice
                    </Link>
                </div>
            ) : sorted.length === 0 ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-10 text-center" data-testid="invoices-list-no-results">
                    <p className="text-muted-k">No invoices match these filters.</p>
                    <button
                        type="button"
                        onClick={clearAll}
                        className="mt-3 inline-block text-primary-k underline hover:no-underline"
                        data-testid="invoices-no-results-clear"
                    >
                        Clear filters
                    </button>
                </div>
            ) : (
                <div className="rounded-2xl border border-primary-k/10 bg-white overflow-x-auto" data-testid="invoices-list-table">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-surface-2 text-muted-k text-xs uppercase tracking-wider">
                                <th colSpan={6} className="p-0">
                                    <div
                                        className="grid items-center gap-4 px-6 py-3 min-w-[720px]"
                                        style={{ gridTemplateColumns: "1.1fr 1.3fr 0.9fr 0.9fr 0.8fr 0.8fr" }}
                                    >
                                        <button type="button" className="text-left hover:text-primary-k" onClick={() => toggleSort("date")}>Invoice date {sortIndicator("date")}</button>
                                        <button type="button" className="text-left hover:text-primary-k" onClick={() => toggleSort("provider")}>Provider {sortIndicator("provider")}</button>
                                        <button type="button" className="text-left hover:text-primary-k" onClick={() => toggleSort("uploaded")}>Uploaded {sortIndicator("uploaded")}</button>
                                        <button type="button" className="text-right hover:text-primary-k" onClick={() => toggleSort("total")}>Amount {sortIndicator("total")}</button>
                                        <button type="button" className="text-right hover:text-primary-k" onClick={() => toggleSort("findings")}>Findings {sortIndicator("findings")}</button>
                                        <div>Verdict</div>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((inv) => {
                                const v = verdictOf(inv);
                                const badge = verdictBadge(v);
                                const total = invoiceTotal(inv);
                                const refund = refundOwed(inv);
                                return (
                                    <tr key={inv.id} className="hover:bg-cream/40 border-t border-primary-k/5">
                                        <td colSpan={6} className="p-0">
                                            <Link
                                                to={`/app/invoices/${inv.id}`}
                                                data-testid={`invoice-row-${inv.id}`}
                                                className="grid items-center gap-4 px-6 py-3 min-w-[720px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k focus-visible:ring-offset-2 rounded"
                                                style={{ gridTemplateColumns: "1.1fr 1.3fr 0.9fr 0.9fr 0.8fr 0.8fr" }}
                                            >
                                                <span className="text-primary-k font-medium tabular-nums">
                                                    {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                                                </span>
                                                <span className="text-primary-k truncate">
                                                    <FileText className="h-3.5 w-3.5 inline mr-1.5 text-primary-k/60" />
                                                    {inv.provider_name || <span className="text-muted-k">Unknown provider</span>}
                                                </span>
                                                <span className="text-muted-k tabular-nums">
                                                    {inv.created_at ? new Date(inv.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short" }) : "—"}
                                                </span>
                                                <span className="text-right text-primary-k tabular-nums">
                                                    {total ? formatAUD2(total) : "—"}
                                                </span>
                                                <span className="text-right">
                                                    {findingCount(inv) > 0 ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 text-gold-800 px-2 py-0.5 text-xs font-semibold">
                                                            {findingCount(inv)}
                                                            {refund > 0 && <span className="text-[10px] font-normal text-gold-800/80">· {formatAUD2(refund)}</span>}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-k text-xs">0</span>
                                                    )}
                                                </span>
                                                <span>
                                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                                                        {badge.label}
                                                    </span>
                                                </span>
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
