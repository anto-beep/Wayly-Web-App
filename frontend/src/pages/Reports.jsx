/**
 * Reports — 8 report types with on-demand PDF generation + in-app preview.
 * Replaces the old SummaryReports one-page summary.
 */
import React, { useEffect, useState, useCallback } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import {
    FileBarChart, FileText, DollarSign, AlertTriangle, Award, Folder, Clock, Layers,
    Download, Eye, Trash2, Loader2, X, ArrowLeft, CheckCircle2,
} from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";

const REPORT_CATALOG = [
    { type: "HOUSEHOLD_SUMMARY", icon: FileText, name: "Household Summary", desc: "Current care snapshot at a glance.", bestFor: "GP visits, family meetings", color: "navy" },
    { type: "QUARTERLY_BUDGET", icon: FileBarChart, name: "Quarterly Budget", desc: "Stream-by-stream spending for the quarter.", bestFor: "Understanding your spending this quarter", color: "gold" },
    { type: "ANNUAL_FINANCIAL", icon: DollarSign, name: "Annual Financial Summary", desc: "Whole financial year. Built for accountants.", bestFor: "Tax time, accountant, financial adviser", color: "navy" },
    { type: "ANOMALY_SAVINGS", icon: AlertTriangle, name: "Anomaly & Savings", desc: "Every billing error caught, and what it returned.", bestFor: "Understanding what Wayly has caught", color: "gold" },
    { type: "PROVIDER_PERFORMANCE", icon: Award, name: "Provider Performance", desc: "Private scorecard of your provider.", bestFor: "Deciding whether to stay or switch", color: "navy", min: 3 },
    { type: "COMPLAINT_DOSSIER", icon: Folder, name: "Complaint Dossier", desc: "Formal evidence pack for OPAN or ACQSC.", bestFor: "Formal complaint to OPAN or ACQSC", color: "red" },
    { type: "CARE_TIMELINE", icon: Clock, name: "Care Timeline", desc: "Chronological history at a glance.", bestFor: "GP appointments, new care managers", color: "teal" },
    { type: "STATEMENT_DIGEST", icon: Layers, name: "Statement Digest", desc: "Every statement compiled. For records or switching.", bestFor: "Full records, switching provider, data export", color: "navy" },
];

const PROGRESS_MESSAGES = [
    "Gathering your data…",
    "Calculating spending by stream…",
    "Writing your summary…",
    "Building your PDF…",
    "Almost done…",
];

export default function Reports() {
    const { active: activeParticipant } = useParticipants();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(null); // { type, report_id, status, error }
    const [preview, setPreview] = useState(null); // { report, data }
    const [showConfig, setShowConfig] = useState(null); // { type }
    const [statementsCount, setStatementsCount] = useState(0);

    const participantId = activeParticipant?.id;

    const load = useCallback(async () => {
        if (!participantId) { setLoading(false); return; }
        setLoading(true);
        try {
            const { data } = await api.get(`/reports?participant_id=${participantId}`);
            setItems((data.items || []).filter((r) => r.status !== "DELETED"));
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load reports"));
        } finally { setLoading(false); }
    }, [participantId]);

    useEffect(() => { load(); }, [load]);

    // Best-effort statements count for the "unlocked" hint on Provider Performance
    useEffect(() => {
        api.get("/statements").then((r) => setStatementsCount((r.data || []).length)).catch(() => setStatementsCount(0));
    }, [participantId]);

    const startGenerate = async (type, params = {}) => {
        setGenerating({ type, status: "GENERATING", started_at: Date.now() });
        try {
            const { data } = await api.post("/reports/generate", {
                report_type: type,
                participant_id: participantId,
                parameters: params,
            });
            const rid = data.report_id;
            // Poll
            let tries = 0;
            const poll = async () => {
                tries += 1;
                try {
                    const { data: r } = await api.get(`/reports/${rid}`);
                    if (r.status === "READY") {
                        setGenerating({ type, report_id: rid, status: "READY" });
                        load();
                        return;
                    }
                    if (r.status === "FAILED") {
                        setGenerating({ type, report_id: rid, status: "FAILED", error: r.error_message });
                        return;
                    }
                } catch { /* ignore */ }
                if (tries < 30) {
                    setTimeout(poll, 2500);
                } else {
                    setGenerating({ type, report_id: rid, status: "FAILED", error: "Timed out waiting for the report" });
                }
            };
            setTimeout(poll, 2000);
        } catch (e) {
            setGenerating({ type, status: "FAILED", error: extractErrorMessage(e, "Generation failed") });
        }
    };

    const openPreview = async (report) => {
        try {
            const { data } = await api.get(`/reports/${report.id}/data`);
            setPreview({ report: data.report, data: data.data });
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not open preview"));
        }
    };

    const downloadReport = async (report) => {
        try {
            const { data } = await api.get(`/reports/${report.id}/download`);
            // Force download in a new tab
            window.open(data.url, "_blank", "noopener");
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not get download URL"));
        }
    };

    const deleteReport = async (report) => {
        if (!window.confirm(`Delete "${report.report_name}"?`)) return;
        try {
            await api.delete(`/reports/${report.id}`);
            toast.success("Deleted");
            load();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not delete"));
        }
    };

    const handleGenerateClick = (rt) => {
        if (rt.type === "QUARTERLY_BUDGET" || rt.type === "ANNUAL_FINANCIAL" || rt.type === "COMPLAINT_DOSSIER" || rt.type === "STATEMENT_DIGEST") {
            setShowConfig({ type: rt.type });
        } else {
            startGenerate(rt.type);
        }
    };

    if (preview) {
        return <ReportPreview preview={preview} onClose={() => setPreview(null)} onDownload={downloadReport} />;
    }

    return (
        <div className="space-y-6" data-testid="reports-page">
            <header>
                <h1 className="font-heading text-3xl text-primary-k tracking-tight">
                    Reports {activeParticipant && <span className="text-base text-muted-k font-sans">· {activeParticipant.first_name}</span>}
                </h1>
                <p className="text-sm text-muted-k mt-1 max-w-2xl">
                    Eight reports built for caregivers. Each one becomes a polished PDF you can email, print, or hand to a GP.
                </p>
            </header>

            <section data-testid="reports-catalog">
                <h2 className="font-heading text-lg text-primary-k mb-3">Generate a report</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-3">
                    {REPORT_CATALOG.map((rt) => {
                        const locked = rt.min && statementsCount < rt.min;
                        return (
                            <div key={rt.type} className="bg-surface border border-kindred rounded-2xl p-4 hover:shadow-sm transition-shadow" data-testid={`report-card-${rt.type}`}>
                                <div className="flex items-start gap-3">
                                    <div className={`h-10 w-10 flex-none rounded-xl flex items-center justify-center ${rt.color === "gold" ? "bg-gold/15 text-gold" : rt.color === "red" ? "bg-terracotta/10 text-terracotta" : rt.color === "teal" ? "bg-sage/15 text-sage" : "bg-primary-k/10 text-primary-k"}`}>
                                        <rt.icon className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-heading text-base text-primary-k">{rt.name}</div>
                                        <p className="text-xs text-muted-k mt-0.5">{rt.desc}</p>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-k mt-2">Best for: <span className="normal-case text-primary-k">{rt.bestFor}</span></p>
                                        {locked && (
                                            <p className="text-[11px] text-terracotta mt-2">Needs {rt.min - statementsCount} more decoded statement{rt.min - statementsCount === 1 ? "" : "s"} to unlock.</p>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleGenerateClick(rt)}
                                            disabled={locked || !participantId}
                                            data-testid={`generate-${rt.type}`}
                                            className="mt-3 inline-flex items-center gap-1.5 bg-gold text-primary-k font-semibold rounded-full px-3.5 py-1.5 text-xs hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Generate
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section data-testid="reports-history">
                <h2 className="font-heading text-lg text-primary-k mt-6 mb-3">Your reports</h2>
                {loading ? (
                    <div className="text-sm text-muted-k flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                ) : items.length === 0 ? (
                    <div className="bg-surface-2 border border-dashed border-kindred rounded-2xl p-6 text-center text-sm text-muted-k">
                        No reports yet. Generate your first report above — it takes less than 30 seconds.
                    </div>
                ) : (
                    <div className="bg-surface border border-kindred rounded-2xl overflow-hidden">
                        <table className="w-full text-sm" data-testid="reports-table">
                            <thead>
                                <tr className="bg-surface-2 text-left text-xs text-muted-k uppercase tracking-wider">
                                    <th className="px-4 py-2.5">Report</th>
                                    <th className="px-4 py-2.5">Generated</th>
                                    <th className="px-4 py-2.5">Status</th>
                                    <th className="px-4 py-2.5">Size</th>
                                    <th className="px-4 py-2.5"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((r) => (
                                    <tr key={r.id} className="border-t border-kindred" data-testid={`report-row-${r.id}`}>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-primary-k">{r.report_name}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-muted-k">{r.report_type.replace(/_/g, " ")}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-k">{new Date(r.created_at).toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            {r.status === "READY" && <span className="inline-flex items-center gap-1 text-xs text-sage"><CheckCircle2 className="h-3 w-3" /> Ready</span>}
                                            {r.status === "GENERATING" && <span className="inline-flex items-center gap-1 text-xs text-muted-k"><Loader2 className="h-3 w-3 animate-spin" /> Generating</span>}
                                            {r.status === "FAILED" && <span className="text-xs text-terracotta">Failed</span>}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-k">{r.file_size_bytes ? `${Math.round(r.file_size_bytes / 1024)} KB` : "—"}</td>
                                        <td className="px-4 py-3 text-right">
                                            {r.status === "READY" && (
                                                <div className="inline-flex items-center gap-1">
                                                    <button onClick={() => openPreview(r)} title="Preview" data-testid={`report-view-${r.id}`} className="p-1.5 text-muted-k hover:text-primary-k"><Eye className="h-4 w-4" /></button>
                                                    <button onClick={() => downloadReport(r)} title="Download" data-testid={`report-download-${r.id}`} className="p-1.5 text-muted-k hover:text-primary-k"><Download className="h-4 w-4" /></button>
                                                    <button onClick={() => deleteReport(r)} title="Delete" data-testid={`report-delete-${r.id}`} className="p-1.5 text-muted-k hover:text-terracotta"><Trash2 className="h-4 w-4" /></button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Generation modal */}
            {generating && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="generation-modal">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
                        {generating.status === "GENERATING" && <GeneratingState type={generating.type} />}
                        {generating.status === "READY" && (
                            <div className="text-center space-y-4">
                                <CheckCircle2 className="h-12 w-12 text-sage mx-auto" />
                                <p className="font-heading text-lg text-primary-k">Your report is ready.</p>
                                <div className="flex gap-2 justify-center">
                                    <button onClick={() => { const r = items.find((i) => i.id === generating.report_id) || { id: generating.report_id }; setGenerating(null); openPreview(r); }} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#16294a]" data-testid="view-report-btn">View</button>
                                    <button onClick={() => { const r = items.find((i) => i.id === generating.report_id) || { id: generating.report_id }; downloadReport(r); }} className="bg-gold text-primary-k font-semibold rounded-md px-4 py-2 text-sm" data-testid="download-report-btn">Download PDF</button>
                                    <button onClick={() => setGenerating(null)} className="text-muted-k px-3 py-2 text-sm">Close</button>
                                </div>
                            </div>
                        )}
                        {generating.status === "FAILED" && (
                            <div className="text-center space-y-4">
                                <X className="h-12 w-12 text-terracotta mx-auto" />
                                <p className="text-sm text-primary-k">Something went wrong generating your report.</p>
                                {generating.error && <p className="text-xs text-muted-k">{generating.error}</p>}
                                <div className="flex gap-2 justify-center">
                                    <button onClick={() => { const t = generating.type; setGenerating(null); startGenerate(t); }} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm">Try again</button>
                                    <button onClick={() => setGenerating(null)} className="text-muted-k px-3 py-2 text-sm">Close</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showConfig && (
                <ConfigModal
                    type={showConfig.type}
                    onClose={() => setShowConfig(null)}
                    onSubmit={(params) => { setShowConfig(null); startGenerate(showConfig.type, params); }}
                />
            )}
        </div>
    );
}

function GeneratingState({ type }) {
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setIdx((i) => (i + 1) % PROGRESS_MESSAGES.length), 2500);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="text-center space-y-4 py-2">
            <Loader2 className="h-10 w-10 text-gold animate-spin mx-auto" />
            <p className="font-heading text-lg text-primary-k">{REPORT_CATALOG.find((r) => r.type === type)?.name || "Report"}</p>
            <p className="text-sm text-muted-k">{PROGRESS_MESSAGES[idx]}</p>
            <p className="text-xs text-muted-k">This usually takes 10–30 seconds.</p>
        </div>
    );
}

function ConfigModal({ type, onClose, onSubmit }) {
    const [params, setParams] = useState({});
    const today = new Date();
    const fy = today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear();

    const submit = () => {
        const out = {};
        if (type === "QUARTERLY_BUDGET") {
            out.quarter = params.quarter || "Q4";
            out.financial_year = Number(params.financial_year || fy);
        } else if (type === "ANNUAL_FINANCIAL") {
            out.financial_year = Number(params.financial_year || fy - 1);
        } else if (type === "COMPLAINT_DOSSIER") {
            out.days = Number(params.days || 365);
            out.addressed_to = params.addressed_to || "Provider";
        } else if (type === "STATEMENT_DIGEST") {
            out.days = Number(params.days || 365);
            out.detail_level = params.detail_level || "summary";
        }
        onSubmit(out);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="config-modal">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
                <div className="px-5 py-3 border-b border-kindred flex items-center justify-between">
                    <h2 className="font-heading text-lg text-primary-k">{REPORT_CATALOG.find((r) => r.type === type)?.name}</h2>
                    <button onClick={onClose} className="text-muted-k"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-5 space-y-3">
                    {type === "QUARTERLY_BUDGET" && (
                        <>
                            <div>
                                <label className="text-xs text-muted-k">Quarter</label>
                                <select value={params.quarter || "Q4"} onChange={(e) => setParams({ ...params, quarter: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="cfg-quarter">
                                    <option value="Q1">Q1 (Jul – Sep)</option>
                                    <option value="Q2">Q2 (Oct – Dec)</option>
                                    <option value="Q3">Q3 (Jan – Mar)</option>
                                    <option value="Q4">Q4 (Apr – Jun)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Financial year (ending June)</label>
                                <input type="number" value={params.financial_year || fy} onChange={(e) => setParams({ ...params, financial_year: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="cfg-fy" />
                            </div>
                        </>
                    )}
                    {type === "ANNUAL_FINANCIAL" && (
                        <div>
                            <label className="text-xs text-muted-k">Financial year (ending June)</label>
                            <input type="number" value={params.financial_year || fy - 1} onChange={(e) => setParams({ ...params, financial_year: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="cfg-fy" />
                        </div>
                    )}
                    {type === "COMPLAINT_DOSSIER" && (
                        <>
                            <div>
                                <label className="text-xs text-muted-k">Period (days)</label>
                                <input type="number" value={params.days || 365} onChange={(e) => setParams({ ...params, days: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="cfg-days" />
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Addressed to</label>
                                <select value={params.addressed_to || "Provider"} onChange={(e) => setParams({ ...params, addressed_to: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="cfg-addressed">
                                    <option value="Provider">Provider</option>
                                    <option value="OPAN">OPAN</option>
                                    <option value="ACQSC">ACQSC</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </>
                    )}
                    {type === "STATEMENT_DIGEST" && (
                        <>
                            <div>
                                <label className="text-xs text-muted-k">Period (days)</label>
                                <input type="number" value={params.days || 365} onChange={(e) => setParams({ ...params, days: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="cfg-days" />
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Detail level</label>
                                <select value={params.detail_level || "summary"} onChange={(e) => setParams({ ...params, detail_level: e.target.value })} className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="cfg-detail">
                                    <option value="summary">Summary only (one block per statement)</option>
                                    <option value="full">Full detail (every line item)</option>
                                </select>
                            </div>
                        </>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-kindred flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-k">Cancel</button>
                    <button onClick={submit} className="bg-gold text-primary-k font-semibold rounded-md px-4 py-2 text-sm" data-testid="cfg-submit">Generate</button>
                </div>
            </div>
        </div>
    );
}

function ReportPreview({ preview, onClose, onDownload }) {
    const { report, data } = preview;
    return (
        <div className="space-y-4" data-testid="report-preview">
            <div className="flex items-center justify-between gap-3">
                <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k" data-testid="preview-back">
                    <ArrowLeft className="h-4 w-4" /> Back to reports
                </button>
                <button onClick={() => onDownload(report)} className="inline-flex items-center gap-1.5 bg-gold text-primary-k font-semibold rounded-full px-4 py-2 text-sm" data-testid="preview-download">
                    <Download className="h-4 w-4" /> Download PDF
                </button>
            </div>
            <div className="bg-surface border border-kindred rounded-2xl p-5">
                <h1 className="font-heading text-2xl text-primary-k">{report.report_name}</h1>
                <p className="text-xs text-muted-k mt-1">Generated {new Date(report.created_at).toLocaleString()}</p>
            </div>
            {data.exec_summary && (
                <div className="bg-surface-2 border border-kindred rounded-2xl p-5">
                    <h3 className="font-heading text-lg text-primary-k mb-2">Summary</h3>
                    <p className="text-sm text-primary-k leading-relaxed">{data.exec_summary}</p>
                </div>
            )}
            {/* Rich generic JSON preview — enough for in-app review; the polished version is the PDF. */}
            <div className="bg-surface border border-kindred rounded-2xl p-5">
                <pre className="text-xs text-primary-k whitespace-pre-wrap" data-testid="preview-json">{JSON.stringify(data, null, 2)}</pre>
            </div>
        </div>
    );
}
