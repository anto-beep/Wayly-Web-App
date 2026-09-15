/**
 * CHSP Invoice Analyzer (CHSP-INV-1).
 *
 * Upload a CHSP invoice → Wayly reads the whole thing, summarises it, shows
 * visual graphics (spend by service category + government vs your contribution),
 * lists every line item so you can read it row by row, and lets you save it to a
 * filterable history table, styled like the Statements page.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    Upload, FileText, Sparkles, ArrowRight, Save, Trash2, Search,
    AlertTriangle, CheckCircle2, ReceiptText, Eye, ListChecks, Landmark, Wallet,
} from "lucide-react";
import { serviceTypeLabel } from "@/lib/labels";
import { formatDate } from "@/lib/formatDate";

const AUD = (v) =>
    v == null || v === "" || isNaN(Number(v))
        ? "—"
        : `$${Number(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CAT_COLOR = {
    clinical: "#0E4D52",
    personal: "#3E6A4C",
    everyday: "#A5512B",
    social: "#B7791F",
    other: "#6B7280",
};

const VAR_TONE = {
    within: "bg-emerald-50 text-emerald-800 border-emerald-200",
    minor: "bg-amber-50 text-amber-800 border-amber-200",
    material: "bg-red-50 text-red-800 border-red-200",
};
const VAR_LABEL = { within: "OK", minor: "Minor", material: "Overcharge" };

function VarianceBadge({ status, delta }) {
    if (!status) return <span className="text-[11px] text-muted-k">—</span>;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${VAR_TONE[status] || VAR_TONE.within}`}>
            {status === "within" ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {VAR_LABEL[status] || status}{delta ? ` ${delta > 0 ? "+" : ""}${AUD(delta)}` : ""}
        </span>
    );
}

// Government subsidy vs the client's own contribution, as a stacked bar + tiles.
function ContributionSplit({ totals }) {
    const govt = Number(totals?.government_subsidy || 0);
    const you = Number(totals?.client_contribution || 0);
    const total = govt + you;
    if (total <= 0) return null;
    const govtPct = Math.round((govt / total) * 100);
    const youPct = 100 - govtPct;
    return (
        <div data-testid="chsp-analyzer-split" className="rounded-xl border border-primary-k/10 bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-primary-k/60">Who pays for this invoice</p>
            <div className="mt-3 flex h-11 w-full overflow-hidden rounded-lg">
                <div className="flex items-center justify-center bg-[#0E4D52] text-white text-xs font-semibold" style={{ width: `${govtPct}%` }} title="Government subsidy">
                    {govtPct >= 12 ? `Govt ${govtPct}%` : ""}
                </div>
                <div className="flex items-center justify-center bg-[#A5512B] text-white text-xs font-semibold" style={{ width: `${youPct}%` }} title="Your contribution">
                    {youPct >= 10 ? `You ${youPct}%` : ""}
                </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#0E4D52]/[0.06] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-primary-k/70"><Landmark className="w-3.5 h-3.5" /> Government subsidy</div>
                    <div className="mt-0.5 font-heading text-lg text-primary-k tabular-nums">{AUD(govt)}</div>
                </div>
                <div className="rounded-lg bg-[#A5512B]/[0.08] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#A5512B]"><Wallet className="w-3.5 h-3.5" /> Your contribution</div>
                    <div className="mt-0.5 font-heading text-lg text-[#A5512B] tabular-nums">{AUD(you)}</div>
                </div>
            </div>
        </div>
    );
}

// Spend by service category, as labelled horizontal bars.
function CategoryBars({ byCategory, grandTotal }) {
    if (!byCategory?.length) return null;
    const max = Math.max(...byCategory.map((c) => Number(c.amount || 0)), 1);
    return (
        <div data-testid="chsp-analyzer-graphics" className="rounded-xl border border-primary-k/10 bg-white p-4">
            <p className="text-[11px] uppercase tracking-wide text-primary-k/60">Where the money went</p>
            <div className="mt-3 space-y-2.5">
                {byCategory.map((c) => {
                    const amt = Number(c.amount || 0);
                    const pctOfMax = Math.max(4, Math.round((amt / max) * 100));
                    const pctOfTotal = grandTotal ? Math.round((amt / grandTotal) * 100) : null;
                    return (
                        <div key={c.key} data-testid={`chsp-analyzer-category-${c.key}`}>
                            <div className="flex items-center justify-between text-xs text-primary-k">
                                <span>{c.label}</span>
                                <span className="tabular-nums">{AUD(amt)}{pctOfTotal != null ? ` · ${pctOfTotal}%` : ""}</span>
                            </div>
                            <div className="mt-1 h-2.5 w-full rounded-full bg-primary-k/5 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pctOfMax}%`, backgroundColor: CAT_COLOR[c.key] || CAT_COLOR.other }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function AnalysisView({ analysis, onSave, saving, savedMode }) {
    const h = analysis.header || {};
    const t = analysis.totals || {};
    const lines = analysis.line_items || [];
    return (
        <div className="space-y-4" data-testid="chsp-analyzer-result">
            {/* Header + summary */}
            <div className="rounded-xl border border-primary-k/10 bg-white p-4" data-testid="chsp-analyzer-summary">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p className="font-heading text-lg text-primary-k">{h.provider_name || "CHSP provider"}</p>
                        <p className="text-xs text-muted-k">
                            {h.invoice_reference ? `Invoice ${h.invoice_reference}` : "Invoice"}
                            {h.period_start ? ` · ${h.period_start}${h.period_end ? ` – ${h.period_end}` : ""}` : ""}
                            {h.client_name ? ` · ${h.client_name}` : ""}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-k">Total billed</div>
                        <div className="font-heading text-xl text-primary-k tabular-nums">{AUD(t.grand_total)}</div>
                    </div>
                </div>
                <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-[#EEF3EE] p-3">
                    <Sparkles className="w-4 h-4 text-primary-k mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-k">{analysis.plain_summary}</p>
                </div>
                {analysis.next_steps?.length > 0 && (
                    <ul className="mt-2 space-y-1" data-testid="chsp-analyzer-next-steps">
                        {analysis.next_steps.map((s, i) => (
                            <li key={i} className="text-xs text-primary-k flex items-start gap-1.5"><ArrowRight className="w-3 h-3 mt-0.5 shrink-0" /> {s}</li>
                        ))}
                    </ul>
                )}
                {analysis.flags_count > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800" data-testid="chsp-analyzer-flags">
                        <AlertTriangle className="w-3.5 h-3.5" /> {analysis.flags_count} line{analysis.flags_count > 1 ? "s" : ""} charged above your saved rate
                    </div>
                )}
            </div>

            {/* Graphics */}
            <div className="grid md:grid-cols-2 gap-4">
                <ContributionSplit totals={t} />
                <CategoryBars byCategory={analysis.by_category} grandTotal={Number(t.grand_total || 0)} />
            </div>

            {/* Line by line */}
            <div className="rounded-xl border border-primary-k/10 bg-white overflow-hidden" data-testid="chsp-analyzer-lines">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-kindred">
                    <ListChecks className="w-4 h-4 text-primary-k" />
                    <p className="text-sm font-medium text-primary-k">Line by line ({lines.length})</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-k bg-primary-k/[0.03]">
                                <th className="px-4 py-2 font-medium">Service</th>
                                <th className="px-4 py-2 font-medium">Dates</th>
                                <th className="px-4 py-2 font-medium text-right">Units</th>
                                <th className="px-4 py-2 font-medium text-right">Unit rate</th>
                                <th className="px-4 py-2 font-medium text-right">Amount</th>
                                <th className="px-4 py-2 font-medium text-right">Rate check</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-kindred">
                            {lines.map((li, i) => (
                                <tr key={i} data-testid={`chsp-analyzer-line-${i}`} className="hover:bg-primary-k/[0.02]">
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CAT_COLOR[li.category] || CAT_COLOR.other }} />
                                            <div>
                                                <div className="text-primary-k">{li.description || serviceTypeLabel(li.service_type)}</div>
                                                <div className="text-[11px] text-muted-k">{li.category_label}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-k text-xs">{li.dates || "—"}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-primary-k">{li.units != null ? `${li.units}${li.unit_label ? ` ${li.unit_label}` : ""}` : "—"}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-primary-k">{AUD(li.unit_rate)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-primary-k">{AUD(li.amount)}</td>
                                    <td className="px-4 py-2.5 text-right"><VarianceBadge status={li.variance_status} delta={li.variance_delta} /></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-primary-k/10 bg-primary-k/[0.03] font-medium text-primary-k">
                                <td className="px-4 py-2.5" colSpan={4}>Total</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{AUD(t.grand_total)}</td>
                                <td className="px-4 py-2.5" />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {!savedMode && (
                <button onClick={onSave} disabled={saving} data-testid="chsp-analyzer-save"
                        className="inline-flex items-center gap-2 rounded-full bg-primary-k px-5 py-2 text-sm text-white disabled:opacity-50">
                    <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save invoice to history"}
                </button>
            )}
            {savedMode && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-xs text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved to your invoice history
                </div>
            )}
        </div>
    );
}

export default function ChspInvoiceAnalyzer() {
    const [analysis, setAnalysis] = useState(null);
    const [savedMode, setSavedMode] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState([]);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all"); // all | flagged
    const fileRef = useRef(null);

    const loadHistory = async () => {
        try { const { data } = await api.get("/chsp1/invoices"); setHistory(data.invoices || []); }
        catch { /* ignore */ }
    };
    useEffect(() => { loadHistory(); }, []);

    const onPick = async (e) => {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = "";
        if (!file) return;
        setParsing(true);
        setAnalysis(null);
        setSavedMode(false);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post("/chsp1/invoice/analyse", fd, { headers: { "Content-Type": "multipart/form-data" } });
            if (!data?.analysis?.extracted) {
                toast.error("We couldn't read any service lines from that file. Try a clearer PDF or photo.");
            } else {
                setAnalysis(data.analysis);
                toast.success(`We read ${data.analysis.line_items.length} line items from your invoice.`);
            }
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not read that invoice.");
        } finally { setParsing(false); }
    };

    const save = async () => {
        if (!analysis) return;
        setSaving(true);
        try {
            await api.post("/chsp1/invoice/save", {
                header: analysis.header,
                line_items: analysis.line_items,
                totals: analysis.totals,
                by_category: analysis.by_category,
                plain_summary: analysis.plain_summary,
                next_steps: analysis.next_steps,
                flags_count: analysis.flags_count || 0,
            });
            setSavedMode(true);
            toast.success("Invoice saved to your history.");
            loadHistory();
        } catch { toast.error("Could not save this invoice."); }
        finally { setSaving(false); }
    };

    const viewSaved = async (id) => {
        try {
            const { data } = await api.get(`/chsp1/invoices/${id}`);
            setAnalysis(data.invoice);
            setSavedMode(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch { toast.error("Could not open that invoice."); }
    };

    const deleteSaved = async (id) => {
        try { await api.delete(`/chsp1/invoices/${id}`); setHistory((l) => l.filter((r) => r.id !== id)); }
        catch { toast.error("Could not delete."); }
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return history.filter((r) => {
            if (filter === "flagged" && !(r.flags_count > 0)) return false;
            if (!q) return true;
            return `${r.provider_name || ""} ${r.invoice_reference || ""}`.toLowerCase().includes(q);
        });
    }, [history, query, filter]);

    return (
        <div className="rounded-2xl bg-[#EAF3F3] p-5 space-y-4" data-testid="chsp-analyzer-root">
            <div>
                <p className="text-xs uppercase tracking-wide text-primary-k/60">Invoice reader</p>
                <h2 className="font-heading text-xl text-primary-k">Read a whole CHSP invoice</h2>
                <p className="text-sm text-muted-k">Upload a PDF or photo. Wayly reads every line, summarises it, shows you where the money goes, and saves it to a history you can filter.</p>
            </div>

            {/* Upload */}
            <div className="rounded-xl bg-white/70 border border-primary-k/10 p-4 flex items-center justify-between gap-2 flex-wrap" data-testid="chsp-analyzer-upload-card">
                <div className="flex items-start gap-2">
                    <div className="p-2 rounded-lg bg-primary-k/10"><FileText className="w-4 h-4 text-primary-k" /></div>
                    <div>
                        <p className="text-sm font-medium text-primary-k">Have the invoice handy?</p>
                        <p className="text-[11px] text-muted-k">PDF or photo. We&apos;ll analyse it line by line.</p>
                    </div>
                </div>
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={onPick} className="hidden" data-testid="chsp-analyzer-upload-input" />
                <button onClick={() => fileRef.current?.click()} disabled={parsing} data-testid="chsp-analyzer-upload"
                        className="text-xs inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-50">
                    <Upload className="w-3.5 h-3.5" /> {parsing ? "Reading…" : "Upload invoice"}
                </button>
            </div>

            {analysis && <AnalysisView analysis={analysis} onSave={save} saving={saving} savedMode={savedMode} />}

            {/* History table (filterable, like Statements) */}
            <div className="rounded-xl bg-white/70 border border-primary-k/10 overflow-hidden" data-testid="chsp-analyzer-history">
                <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b border-kindred">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary-k"><ReceiptText className="w-4 h-4" /> Invoice history ({history.length})</span>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-k" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search provider or reference"
                                   data-testid="chsp-analyzer-history-search"
                                   className="pl-8 pr-3 py-1.5 text-xs border border-kindred rounded-full bg-white w-56 max-w-[60vw]" />
                        </div>
                        <select value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="chsp-analyzer-history-filter"
                                className="text-xs border border-kindred rounded-full bg-white px-3 py-1.5">
                            <option value="all">All invoices</option>
                            <option value="flagged">Flagged only</option>
                        </select>
                    </div>
                </div>
                {history.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-k" data-testid="chsp-analyzer-history-empty">
                        No saved invoices yet. Upload one above and tap “Save invoice to history”.
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-k">No invoices match your filter.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-k bg-primary-k/[0.03]">
                                    <th className="px-4 py-2 font-medium">Provider / reference</th>
                                    <th className="px-4 py-2 font-medium">Period</th>
                                    <th className="px-4 py-2 font-medium text-right">Total</th>
                                    <th className="px-4 py-2 font-medium text-right">Your contribution</th>
                                    <th className="px-4 py-2 font-medium text-center">Lines</th>
                                    <th className="px-4 py-2 font-medium text-center">Flags</th>
                                    <th className="px-4 py-2 font-medium text-right">Saved</th>
                                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-kindred">
                                {filtered.map((r) => (
                                    <tr key={r.id} data-testid={`chsp-analyzer-history-row-${r.id}`} className="hover:bg-primary-k/[0.02]">
                                        <td className="px-4 py-2.5">
                                            <div className="text-primary-k">{r.provider_name || "Provider"}</div>
                                            <div className="text-[11px] text-muted-k">{r.invoice_reference || "—"}</div>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-muted-k">{r.period_start ? `${r.period_start}${r.period_end ? ` – ${r.period_end}` : ""}` : "—"}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-primary-k">{AUD(r.grand_total)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-[#A5512B]">{AUD(r.client_contribution)}</td>
                                        <td className="px-4 py-2.5 text-center text-primary-k">{r.line_count ?? (r.line_items?.length || 0)}</td>
                                        <td className="px-4 py-2.5 text-center">
                                            {r.flags_count > 0
                                                ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{r.flags_count}</span>
                                                : <span className="text-[11px] text-muted-k">—</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-xs text-muted-k">{formatDate(r.created_at) || ""}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => viewSaved(r.id)} data-testid={`chsp-analyzer-history-view-${r.id}`} className="inline-flex items-center gap-1 text-xs text-primary-k hover:underline"><Eye className="w-3.5 h-3.5" /> View</button>
                                                <button onClick={() => deleteSaved(r.id)} data-testid={`chsp-analyzer-history-delete-${r.id}`} className="text-red-600"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
