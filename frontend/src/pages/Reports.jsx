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
                                    <button onClick={() => { const r = items.find((i) => i.id === generating.report_id) || { id: generating.report_id }; setGenerating(null); openPreview(r); }} className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]" data-testid="view-report-btn">View</button>
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
                <p className="text-xs text-muted-k mt-1">
                    Generated {new Date(report.created_at).toLocaleString()}
                    {data.participant ? ` · ${data.participant.first_name || ""} ${data.participant.last_name || ""}` : ""}
                </p>
            </div>
            {data.exec_summary && (
                <div className="bg-surface-2 border border-kindred rounded-2xl p-5">
                    <h3 className="font-heading text-lg text-primary-k mb-2">Summary</h3>
                    <p className="text-sm text-primary-k leading-relaxed whitespace-pre-line">{data.exec_summary}</p>
                </div>
            )}
            <ReportBody type={report.report_type} data={data} />
        </div>
    );
}

const SEV_BADGE = {
    HIGH: "bg-terracotta/15 text-terracotta",
    MEDIUM: "bg-gold/20 text-gold",
    LOW: "bg-surface-2 text-muted-k",
};
const TRAFFIC_BAR = { green: "bg-sage", amber: "bg-gold", red: "bg-terracotta" };

function Bar({ pct, traffic }) {
    return (
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className={`h-full ${TRAFFIC_BAR[traffic] || "bg-primary-k"}`} style={{ width: `${Math.min(100, pct || 0)}%` }} />
        </div>
    );
}

function money(v) {
    const n = Number(v || 0);
    return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ReportBody({ type, data }) {
    if (type === "HOUSEHOLD_SUMMARY") return <HouseholdSummaryView data={data} />;
    if (type === "QUARTERLY_BUDGET") return <QuarterlyBudgetView data={data} />;
    if (type === "ANNUAL_FINANCIAL") return <AnnualFinancialView data={data} />;
    if (type === "ANOMALY_SAVINGS") return <AnomalySavingsView data={data} />;
    if (type === "PROVIDER_PERFORMANCE") return <ProviderPerformanceView data={data} />;
    if (type === "COMPLAINT_DOSSIER") return <ComplaintDossierView data={data} />;
    if (type === "CARE_TIMELINE") return <CareTimelineView data={data} />;
    if (type === "STATEMENT_DIGEST") return <StatementDigestView data={data} />;
    return null;
}

function StatCard({ label, value, sub, tone }) {
    return (
        <div className="bg-surface border border-kindred rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-k">{label}</div>
            <div className={`text-2xl font-semibold mt-1 ${tone || "text-primary-k"}`}>{value}</div>
            {sub && <div className="text-xs text-muted-k mt-0.5">{sub}</div>}
        </div>
    );
}

function HouseholdSummaryView({ data }) {
    const q = data.quarter || {};
    const stats = data.stats || {};
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={`Budget · ${q.label || ""}`} value={`${q.pct ?? 0}%`} sub={`${money(q.spent)} of ${money(q.budget)}`} />
                <StatCard label="Services this quarter" value={stats.services_count ?? 0} />
                <StatCard label="Anomalies flagged" value={stats.anomalies_count ?? 0} sub={stats.anomalies_severity} />
                <StatCard label="Open concerns" value={stats.open_concerns ?? 0} tone={stats.open_concerns ? "text-terracotta" : "text-primary-k"} />
            </div>
            <Section title="Active services">
                <Table head={["Service", "Worker", "Stream", "Rate"]} rows={(data.active_services || []).map((s) => [s.service, s.worker || "—", s.stream || "—", s.rate ? money(s.rate) : "—"])} empty="No active services recorded." />
            </Section>
            <Section title="Care team">
                <Table head={["Name", "Role", "Phone"]} rows={(data.care_team || []).map((m) => [m.name, m.role || "—", m.phone || "—"])} empty="No care team members recorded." />
            </Section>
            <Section title="Upcoming">
                <Line label="Next scheduled visit" value={data.next_visit ? `${new Date(data.next_visit.starts_at).toLocaleString()} · ${data.next_visit.service || "—"} · ${data.next_visit.worker || "—"}` : "No upcoming visits."} />
                <Line label="Next AT-HM expiry" value={data.next_athm ? `${data.next_athm.item_description} · expires ${new Date(data.next_athm.expires_at).toLocaleDateString()}` : "No AT-HM commitments."} />
            </Section>
            <Section title="Recent concerns">
                <Table head={["Date", "Type", "Headline", "Status"]} rows={(data.recent_concerns || []).map((c) => [new Date(c.created_at).toLocaleDateString(), c.type || "—", c.title || c.headline || "—", c.status || "open"])} empty="No concerns recorded." />
            </Section>
            <Section title="Hospitalisation (last 12 months)">
                {data.hospitalisations?.length ? (
                    <Table head={["Admitted", "Discharged", "Hospital", "Duration", "RCP"]} rows={data.hospitalisations.map((h) => [new Date(h.admitted_at).toLocaleDateString(), h.discharged_at ? new Date(h.discharged_at).toLocaleDateString() : "—", h.hospital_name || "—", h.duration_days ? `${h.duration_days} d` : "—", h.rcp_requested ? "yes" : "no"])} />
                ) : <Empty>No hospitalisations recorded in the last 12 months.</Empty>}
            </Section>
        </div>
    );
}

function QuarterlyBudgetView({ data }) {
    const ov = data.overview || {};
    const ro = data.rollover || {};
    return (
        <div className="space-y-4">
            <Section title="Budget overview">
                <Bar pct={ov.pct} traffic={ov.traffic} />
                <p className="text-sm text-primary-k mt-2"><strong>{ov.pct ?? 0}%</strong> used · {money(ov.spent)} of {money(ov.budget)} · {money(ov.remaining)} remaining</p>
                {ro.above_cap > 0 && (
                    <div className="mt-2 p-3 bg-gold/10 border border-gold rounded-md text-sm text-primary-k">
                        Rollover alert: ~{money(ro.projected_unspent)} may be unspent at quarter end. Only {money(ro.rollover_cap)} rolls over — {money(ro.above_cap)} above the cap may be forfeited.
                    </div>
                )}
            </Section>
            <Section title="Spending by stream">
                {(data.streams || []).map((s) => (
                    <div key={s.name} className="mb-3">
                        <div className="flex justify-between text-sm"><strong>{s.name}</strong><span>{money(s.spent)} of {money(s.cap)} ({s.pct}%)</span></div>
                        <Bar pct={s.pct} traffic={s.traffic} />
                        <div className="text-xs text-muted-k mt-1">Your contribution {money(s.contribution)} · Government paid {money(s.government)}</div>
                    </div>
                ))}
            </Section>
            <Section title="Month-by-month">
                {data.months?.length ? (
                    <Table
                        head={["Stream", ...data.months.map((m) => m.label)]}
                        rows={["Clinical", "Independence", "Everyday Living"].map((sn) => [sn, ...data.months.map((m) => money((m.by_stream || {})[sn] || 0))])}
                        foot={["Total", ...data.months.map((m) => money(m.total))]}
                    />
                ) : <Empty>No monthly data.</Empty>}
            </Section>
            <Section title="Care management">
                <Bar pct={data.care_management?.pct} traffic={data.care_management?.traffic} />
                <p className="text-sm text-primary-k mt-2">{data.care_management?.pct ?? 0}% used · {money(data.care_management?.used)} of {money(data.care_management?.cap)}</p>
            </Section>
            <Section title="Anomalies this quarter">
                {data.anomalies?.length ? (
                    <Table head={["Severity", "Headline", "$ impact"]} rows={data.anomalies.map((a) => [<Badge key={a.headline} sev={a.severity} />, a.headline, money(a.dollar_impact || 0)])} />
                ) : <Empty>No anomalies flagged this quarter.</Empty>}
            </Section>
        </div>
    );
}

function AnnualFinancialView({ data }) {
    const s = data.stats || {};
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Annual entitlement" value={money(s.annual_entitlement)} />
                <StatCard label="Total gross" value={money(s.gross)} />
                <StatCard label="Your contribution" value={money(s.contribution)} />
                <StatCard label="Government paid" value={money(s.government)} />
                <StatCard label="Lifetime cap used" value={money(s.lifetime_cap_used)} sub={`${s.lifetime_cap_pct ?? 0}%`} />
                <StatCard label="Lifetime cap remaining" value={money(s.lifetime_cap_remaining)} />
            </div>
            <Section title="Contributions by stream">
                <Table head={["Stream", "Annual total", "Your contribution", "Government"]} rows={(data.by_stream || []).map((st) => [st.name, money(st.total), money(st.contribution), money(st.government)])} empty="No stream data." />
            </Section>
        </div>
    );
}

function AnomalySavingsView({ data }) {
    const hero = data.hero || {};
    const sub = data.subscription || {};
    return (
        <div className="space-y-4">
            <div className="rounded-2xl p-6 text-primary-k" style={{ background: "linear-gradient(135deg,#C8A968 0%,#D6BD86 100%)" }}>
                <div className="text-xs uppercase tracking-wider">in potential billing errors identified</div>
                <div className="text-4xl font-extrabold mt-1">{money(hero.total_value)}</div>
                <div className="text-xs mt-1">Across {hero.statements_count} statements · {hero.anomalies_count} flagged · {hero.resolved_count} resolved</div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-sage/30 rounded-md p-3"><div className="text-[10px] uppercase">Resolved</div><div className="text-xl font-bold">{money(hero.resolved_value)}</div></div>
                    <div className="bg-terracotta/20 rounded-md p-3"><div className="text-[10px] uppercase">Outstanding</div><div className="text-xl font-bold">{money(hero.outstanding_value)}</div></div>
                </div>
            </div>
            <Section title="Anomalies by type">
                {data.by_type?.length ? (
                    <Table head={["Type", "Count", "Total", "Resolved", "Outstanding"]} rows={data.by_type.map((t) => [t.type, t.count, money(t.value), money(t.resolved), money(t.outstanding)])} />
                ) : <Empty>No anomalies have been flagged in this period. Keep decoding your statements — each one is another chance to catch errors.</Empty>}
            </Section>
            <Section title="Timeline of anomalies">
                {data.timeline?.length ? (
                    <Table head={["Date", "Severity", "Headline", "Value", "Status"]} rows={data.timeline.map((t) => [t.date ? new Date(t.date).toLocaleDateString() : "—", <Badge key={t.headline + t.date} sev={t.severity} />, t.headline, money(t.value), t.status])} />
                ) : <Empty>No anomalies to display.</Empty>}
            </Section>
            <Section title="Subscription value">
                <div className="bg-gold/10 border border-gold rounded-xl p-4 space-y-1 text-sm text-primary-k">
                    <p>Wayly subscription cost over this period: <strong>{money(sub.total)}</strong> ({sub.plan})</p>
                    <p>Anomalies identified: <strong>{money(hero.total_value)}</strong></p>
                    <p>Anomalies resolved: <strong>{money(hero.resolved_value)}</strong></p>
                    {hero.resolved_value > sub.total ? (
                        <p className="text-lg font-bold mt-2">Wayly has more than paid for itself · {sub.roi}× return</p>
                    ) : (
                        <p className="text-muted-k">Keep decoding your monthly statements — each one is another chance to catch errors.</p>
                    )}
                </div>
            </Section>
        </div>
    );
}

function ProviderPerformanceView({ data }) {
    if (data.locked) {
        return (
            <Section title="Provider Performance">
                <Empty>This report requires at least {data.statements_needed} decoded statements. You have {data.statements_available}. Keep decoding to unlock.</Empty>
            </Section>
        );
    }
    return (
        <div className="space-y-4">
            <div className="bg-primary-k/10 border border-primary-k rounded-xl p-3 text-sm text-primary-k"><strong>Private.</strong> This report is for your records only. It is not visible to your provider and will never be shared by Wayly.</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-primary-k text-cream rounded-xl p-6 text-center">
                    <div className="text-6xl font-extrabold text-gold leading-none">{data.grade}</div>
                    <div className="text-sm mt-2">{data.grade_label}</div>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-3">
                    <StatCard label="Visits delivered" value={`${data.delivery?.pct ?? 0}%`} sub={`${data.delivery?.delivered ?? 0} of ${data.delivery?.total ?? 0}`} />
                    <StatCard label="Anomaly-free statements" value={`${data.billing?.anomaly_free_pct ?? 0}%`} sub={`${data.billing?.with_anomaly ?? 0} of ${data.billing?.statements_count ?? 0} had anomalies`} />
                    <StatCard label="Correspondence responded" value={`${data.correspondence?.responded ?? 0} / ${data.correspondence?.total ?? 0}`} />
                    <StatCard label="Avg anomaly $ / statement" value={money(data.billing?.avg_value)} />
                </div>
            </div>
            <Section title="Billing accuracy">
                <Table head={["Statement", "Anomalies", "Total value", "Resolved"]} rows={(data.billing?.per_statement || []).map((r) => [r.statement, r.anomaly_count, money(r.value), `${r.resolved_count} of ${r.anomaly_count}`])} empty="No statements in scope." />
            </Section>
        </div>
    );
}

function ComplaintDossierView({ data }) {
    return (
        <div className="space-y-4">
            <div className="bg-surface-2 border border-kindred rounded-xl p-4 text-sm text-primary-k">
                <p><strong>Prepared for submission to:</strong> {data.addressed_to}</p>
                <p>Participant: {data.participant?.first_name} {data.participant?.last_name}{data.participant?.date_of_birth ? ` · DOB ${data.participant.date_of_birth}` : ""}</p>
                <p>Provider: {data.household?.provider_name || "—"}</p>
                <p>Period: {data.date_range?.start} to {data.date_range?.end}</p>
            </div>
            <Section title="Concerns">
                {data.concerns?.length ? (
                    <Table head={["Date", "Type", "Title", "Severity", "Status"]} rows={data.concerns.map((c) => [new Date(c.created_at).toLocaleDateString(), c.type || "—", c.title || c.headline || "—", c.severity || "—", c.status || "open"])} />
                ) : <Empty>No concerns recorded in this period.</Empty>}
            </Section>
            <Section title="Correspondence history">
                {data.correspondence?.length ? (
                    <Table head={["Date sent", "Type", "Recipient", "Response"]} rows={data.correspondence.map((c) => [c.sent_at ? new Date(c.sent_at).toLocaleDateString() : "—", c.type || "—", c.recipient || "—", c.response_received_at ? new Date(c.response_received_at).toLocaleDateString() : "No response"])} />
                ) : <Empty>No correspondence recorded.</Empty>}
            </Section>
            <Section title="Billing anomaly evidence">
                {data.anomalies?.length ? (
                    <Table head={["Statement", "Type", "Severity", "$ impact", "Status"]} rows={data.anomalies.map((a, i) => [a.statement || "—", a.headline, <Badge key={i} sev={a.severity} />, money(a.dollar_impact || 0), a.status || "pending"])} />
                ) : <Empty>No HIGH/MEDIUM anomalies in this period.</Empty>}
            </Section>
        </div>
    );
}

function CareTimelineView({ data }) {
    return (
        <Section title="Care timeline">
            {data.events?.length ? (
                <div className="space-y-3">
                    {data.events.map((ev, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-surface border border-kindred rounded-xl">
                            <div className={`mt-1 h-3 w-3 rounded-full flex-none ${ev.color === "navy" ? "bg-primary-k" : ev.color === "gold" ? "bg-gold" : ev.color === "teal" ? "bg-sage" : ev.color === "red" ? "bg-terracotta" : ev.color === "purple" ? "bg-[#715A99]" : "bg-sage"}`} />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-primary-k">{ev.date ? new Date(ev.date).toLocaleDateString() : "—"} · {ev.headline}</div>
                                {ev.detail && <div className="text-xs text-muted-k mt-0.5">{ev.detail}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty>No significant events recorded yet. Events appear here as you log hospitalisations, care plan changes, AT-HM installations, and concerns.</Empty>
            )}
        </Section>
    );
}

function StatementDigestView({ data }) {
    const t = data.totals || {};
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Statements" value={t.statements ?? 0} />
                <StatCard label="Total gross" value={money(t.gross)} />
                <StatCard label="Total contributions" value={money(t.contribution)} />
                <StatCard label="Anomalies" value={t.anomalies ?? 0} />
            </div>
            <Section title="Statements">
                {data.rows?.length ? (
                    <Table head={["Month", "Provider", "Gross", "Contribution", "Govt", "Anomalies"]} rows={data.rows.map((r) => [r.period, r.provider, money(r.gross), money(r.contribution), money(r.government), `${r.anomaly_counts?.HIGH ? r.anomaly_counts.HIGH + " H " : ""}${r.anomaly_counts?.MEDIUM ? r.anomaly_counts.MEDIUM + " M " : ""}${r.anomaly_counts?.LOW ? r.anomaly_counts.LOW + " L" : ""}`.trim() || "—"])} />
                ) : <Empty>No statements decoded yet in this period.</Empty>}
            </Section>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="bg-surface border border-kindred rounded-2xl p-5">
            <h3 className="font-heading text-lg text-primary-k mb-3">{title}</h3>
            {children}
        </section>
    );
}

function Table({ head, rows, foot, empty }) {
    if (!rows || rows.length === 0) {
        return empty ? <Empty>{empty}</Empty> : null;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-left text-muted-k border-b border-kindred">
                        {head.map((h) => <th key={h} className="py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">{h}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b border-kindred/40">
                            {row.map((cell, j) => <td key={j} className="py-2 pr-3 align-top text-primary-k">{cell}</td>)}
                        </tr>
                    ))}
                </tbody>
                {foot && (
                    <tfoot>
                        <tr className="font-semibold text-primary-k">
                            {foot.map((cell, j) => <td key={j} className="py-2 pr-3">{cell}</td>)}
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

function Line({ label, value }) {
    return (
        <div className="flex items-baseline gap-2 text-sm py-1">
            <span className="text-xs uppercase tracking-wider text-muted-k">{label}:</span>
            <span className="text-primary-k">{value}</span>
        </div>
    );
}

function Empty({ children }) {
    return <p className="text-sm text-muted-k italic">{children}</p>;
}

function Badge({ sev }) {
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${SEV_BADGE[sev] || SEV_BADGE.LOW}`}>{sev}</span>;
}
