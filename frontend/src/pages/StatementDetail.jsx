import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatAUD2, extractErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileDown, MessageCircle, Archive, History, RotateCcw, Trash2, GitCompare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import AIAccuracyBanner from "@/components/AIAccuracyBanner";
import DecoderResultView from "@/components/DecoderResultView";
import { ArchiveConfirmModal, PermanentDeleteModal, NeedsReviewBanner } from "@/components/statements/StatementLifecycleModals";
import StatementNotes from "@/components/statements/StatementNotes";
import StatementStatusBadge from "@/components/statements/StatementStatusBadge";
import StatementAskWayly from "@/components/statements/StatementAskWayly";
import StatementRightsPanel from "@/components/statements/StatementRightsPanel";
import { periodCompact, periodExact, providerName, decodeStatus, flagsCount } from "@/lib/statementFields";
import { useParticipants } from "@/context/ParticipantsContext";
import FlagCard from "@/components/FlagCard";
import SmartAISummary from "@/components/SmartAISummary";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const STREAM_BADGE = {
    Clinical: "bg-[#0F5648] text-white",
    Independence: "bg-[#8B9B82] text-white",
    "Everyday Living": "bg-[#A05545] text-white",
};

// Pull a decoded export (PDF or CSV) from the server. Web + mobile call
// the same endpoint so the downloaded files are byte-identical. The
// `?v=<updated_at>` query param busts any HTTP-cache layer (CDN, mobile
// URLSession) when the underlying statement data changes.
async function downloadDecodedExport(stmt, kind /* "pdf" | "csv" */) {
    try {
        const stmtId = stmt?.id;
        const period = stmt?.period_label || stmt?.filename;
        const version = stmt?.updated_at || stmt?.uploaded_at || stmt?.created_at || "";
        const cacheBust = version
            ? `?v=${encodeURIComponent(String(version).replace(/[^\w.-]/g, ""))}`
            : "";
        const resp = await api.get(
            `/statements/${stmtId}/decoded.${kind}${cacheBust}`,
            { responseType: "blob" },
        );
        const blob = resp.data;
        if (!blob || blob.size === 0) {
            toast.error(`Couldn't generate the decoded ${kind.toUpperCase()}.`);
            return;
        }
        const safePeriod = (period || "statement").replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "") || "statement";
        const filename = kind === "pdf"
            ? `${safePeriod}-decoded.pdf`
            : `statement-decoded-${safePeriod}.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
            toast.error("Statement not found.");
        } else {
            toast.error(`Couldn't download decoded ${kind.toUpperCase()}. Please try again.`);
        }
    }
}

function _sevCounts(stmt) {
    const ac = stmt.audit_json?.anomaly_count;
    if (ac && (ac.high || ac.medium || ac.low || ac.advisory)) {
        return { high: ac.high || 0, medium: ac.medium || 0, low: (ac.low || 0) + (ac.advisory || 0) };
    }
    const out = { high: 0, medium: 0, low: 0 };
    (stmt.anomalies || []).forEach((a) => {
        const s = a.severity;
        if (s === "alert" || s === "high") out.high += 1;
        else if (s === "info" || s === "low" || s === "advisory") out.low += 1;
        else out.medium += 1;
    });
    return out;
}

// Visual graphics for a statement: a "where the money went" donut plus a
// "what we found" severity breakdown. Shown at the top of every statement so
// people can grasp the numbers at a glance.
function StatementInsightGraphics({ stmt }) {
    const ss = stmt.audit_json?.statement_summary || {};
    const gov = Number(ss.total_government_paid) || 0;
    const you = Number(ss.total_participant_contribution) || 0;
    const hasMoney = gov > 0 || you > 0;
    const sev = _sevCounts(stmt);
    const totalFlags = sev.high + sev.medium + sev.low;

    const money = [
        { name: "Government paid", value: gov, color: "#425F47" },
        { name: "You paid", value: you, color: "#A5512B" },
    ];
    const sevData = [
        { name: "Needs attention", value: sev.high, color: "#C0392B" },
        { name: "Worth a look", value: sev.medium, color: "#A5512B" },
        { name: "For your info", value: sev.low, color: "#425F47" },
    ].filter((d) => d.value > 0);
    const govPct = hasMoney ? Math.round((gov / (gov + you)) * 100) : 0;

    if (!hasMoney && totalFlags === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="statement-graphics">
            {hasMoney && (
                <div className="sect-teal border border-kindred rounded-2xl p-5" data-testid="statement-money-graphic">
                    <div className="text-xs uppercase tracking-wider text-muted-k">Where the money went</div>
                    <div className="mt-2 flex items-center gap-5">
                        <div className="relative h-[130px] w-[130px] flex-none" role="img" aria-label={`Government paid ${govPct}%, you paid ${100 - govPct}%`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={money} dataKey="value" innerRadius={44} outerRadius={62} startAngle={90} endAngle={-270} stroke="none" paddingAngle={2}>
                                        {money.map((d) => <Cell key={d.name} fill={d.color} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-heading text-xl text-primary-k tabular-nums leading-none">{govPct}%</span>
                                <span className="text-[9px] uppercase tracking-wider text-muted-k mt-0.5">funded</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between gap-2 rounded-lg item-sage border p-2.5">
                                <span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sage inline-block" /> Government</span>
                                <span className="font-semibold text-primary-k tabular-nums">{formatAUD2(gov)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 rounded-lg item-clay border p-2.5">
                                <span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-clay inline-block" /> You paid</span>
                                <span className="font-semibold text-primary-k tabular-nums">{formatAUD2(you)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {totalFlags > 0 && (
                <div className="sect-clay border border-kindred rounded-2xl p-5" data-testid="statement-severity-graphic">
                    <div className="text-xs uppercase tracking-wider text-muted-k">What we found</div>
                    <div className="mt-2 flex items-center gap-5">
                        <div className="relative h-[130px] w-[130px] flex-none" role="img" aria-label={`${totalFlags} things to know`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={sevData} dataKey="value" innerRadius={44} outerRadius={62} startAngle={90} endAngle={-270} stroke="none" paddingAngle={2}>
                                        {sevData.map((d) => <Cell key={d.name} fill={d.color} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-heading text-xl text-primary-k tabular-nums leading-none">{totalFlags}</span>
                                <span className="text-[9px] uppercase tracking-wider text-muted-k mt-0.5">to know</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-2">
                            {sevData.map((d) => (
                                <div key={d.name} className="flex items-center justify-between gap-2 rounded-lg border border-kindred px-2.5 py-2">
                                    <span className="text-sm text-primary-k inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: d.color }} /> {d.name}</span>
                                    <span className="font-semibold text-primary-k tabular-nums">{d.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


export default function StatementDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const [stmt, setStmt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [archiveImpact, setArchiveImpact] = useState(null);
    const [archiveBusy, setArchiveBusy] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/statements/${id}`);
                setStmt(data);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    if (loading) return <div className="text-muted-k">Loading…</div>;
    if (!stmt) return <div className="text-muted-k">Statement not found.</div>;

    const total = (stmt.line_items || []).reduce((acc, li) => acc + (li.total || 0), 0);
    const totalContribution = (stmt.line_items || []).reduce((acc, li) => acc + (li.contribution_paid || 0), 0);
    const isArchived = stmt.state === "archived";

    const openArchiveModal = async () => {
        setActionBusy(true);
        try {
            const { data } = await api.delete(`/statements/${id}/archive?preview=true`);
            setArchiveImpact(data);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Couldn't preview the archive impact"));
        } finally {
            setActionBusy(false);
        }
    };

    const confirmArchive = async () => {
        setArchiveBusy(true);
        try {
            await api.delete(`/statements/${id}/archive`);
            toast.success("Statement archived");
            setArchiveImpact(null);
            nav("/app/statements");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Couldn't archive the statement"));
        } finally {
            setArchiveBusy(false);
        }
    };

    const restore = async () => {
        setActionBusy(true);
        try {
            await api.post(`/statements/${id}/restore`);
            toast.success("Statement restored");
            const { data } = await api.get(`/statements/${id}`);
            setStmt(data);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail?.error === "ACTIVE_VERSION_EXISTS") {
                toast.error("Another version of this statement is currently active. Archive that one first.");
            } else {
                toast.error(extractErrorMessage(err, "Couldn't restore the statement"));
            }
        } finally {
            setActionBusy(false);
        }
    };

    const confirmPermanentDelete = async () => {
        setDeleteBusy(true);
        try {
            await api.delete(`/statements/${id}/permanent`);
            toast.success("Statement permanently deleted");
            setDeleteOpen(false);
            nav("/app/statements/archived");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Couldn't delete the statement"));
        } finally {
            setDeleteBusy(false);
        }
    };

    const downloadOriginal = async () => {
        try {
            const resp = await api.get(`/statements/${stmt.id}/download`, { responseType: "blob" });
            const blob = resp.data;
            if (!blob || blob.size === 0) {
                toast.error("Original file isn't available for this statement.");
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = stmt.filename || "statement";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) {
                toast.error("Original file isn't available for this statement.");
            } else {
                toast.error("Couldn't download the original file. Please try again.");
            }
        }
    };

    return (
        <div className="space-y-6" data-testid="statement-detail-page">
            <Link to="/app/statements" className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k">
                <ArrowLeft className="h-4 w-4" /> Back to Statements
            </Link>
            <ReconcileWithPacingPrompt stmt={stmt} />
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <span className="overline">Statement</span>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2" title={periodExact(stmt)}>
                        {periodCompact(stmt)}
                        <span className="text-muted-k font-normal"> · {providerName(stmt)}</span>
                    </h1>
                    <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-muted-k">
                        <span>{(stmt.line_items || []).length} line items · {formatAUD2(total)} total · {formatAUD2(totalContribution)} contribution</span>
                        <StatementStatusBadge
                            status={decodeStatus(stmt)}
                            flagsCount={flagsCount(stmt)}
                            hasNote={!!stmt.has_note}
                            testid="statement-detail-status"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={downloadOriginal}
                        disabled={!stmt.has_original_file}
                        className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface-2 text-primary-k disabled:opacity-40 disabled:cursor-not-allowed"
                        data-testid="statement-download-original-btn"
                        title={stmt.has_original_file ? "Download the original file as received, the evidentiary copy for disputes" : "Original file no longer available."}
                    >
                        <Download className="h-3.5 w-3.5" /> Download original {stmt.filename && stmt.filename.includes(".") ? `(${stmt.filename.split(".").pop().toUpperCase()})` : "(as received)"}
                    </button>

                    {/* Compare side-by-side · STMT-UI-1 v2 Phase 3.
                        Enabled whenever an original PDF is retained (the only file type
                        for which the react-pdf viewer makes sense; CSV/TXT downloads still
                        get the "Download original" evidentiary path). */}
                    {stmt.has_original_file && String(stmt.file_mimetype || "").includes("pdf") && (
                        <Link
                            to={`/app/statements/${stmt.id}/compare`}
                            className="inline-flex items-center gap-1.5 text-sm bg-primary-k text-white rounded-md px-3 py-1.5 hover:bg-primary-k/90"
                            data-testid="statement-compare-btn"
                            title="Open the original PDF next to the decoded breakdown."
                        >
                            <GitCompare className="h-3.5 w-3.5" /> Compare side-by-side
                        </Link>
                    )}

                    {/* DEC-1 Phase 1: only offer the server-rendered CSV/PDF for legacy
                        statements. New (rich-payload) statements use the identical
                        client-side PDF/CSV via <DecoderResultView> below, so we don't
                        duplicate the buttons. */}
                    {!(stmt.audit_json && stmt.extracted_json) && (
                        <>
                            <button
                                onClick={() => downloadDecodedExport(stmt, "csv")}
                                className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface-2 text-primary-k"
                                data-testid="statement-download-csv-btn"
                                title="Download decoded line items as CSV"
                            >
                                <FileDown className="h-3.5 w-3.5" /> Decoded CSV
                            </button>
                            <button
                                onClick={() => downloadDecodedExport(stmt, "pdf")}
                                className="inline-flex items-center gap-1.5 text-sm bg-primary-k text-white rounded-md px-3 py-1.5 hover:bg-[#091D33]"
                                data-testid="statement-download-pdf-btn"
                                title="Download decoded summary as PDF"
                            >
                                <FileDown className="h-3.5 w-3.5" /> Decoded PDF
                            </button>
                        </>
                    )}
                    <Link
                        to={`/app/statements/${stmt.id}/audit-log`}
                        data-testid="statement-audit-log-link"
                        className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface-2 text-primary-k"
                        title="See every change recorded for this statement"
                    >
                        <History className="h-3.5 w-3.5" /> Audit Log
                    </Link>
                    {!isArchived ? (
                        <button
                            type="button"
                            onClick={openArchiveModal}
                            disabled={actionBusy}
                            data-testid="statement-archive-btn"
                            className="inline-flex items-center gap-1.5 text-sm border border-terracotta/40 text-terracotta rounded-md px-3 py-1.5 hover:bg-terracotta/5 disabled:opacity-50"
                            title="Archive this statement (30-day restore window)"
                        >
                            <Archive className="h-3.5 w-3.5" /> Archive
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={restore}
                                disabled={actionBusy}
                                data-testid="statement-restore-btn"
                                className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface-2 text-primary-k disabled:opacity-50"
                                title="Restore this statement to active"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> Restore
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeleteOpen(true)}
                                data-testid="statement-permanent-delete-btn"
                                className="inline-flex items-center gap-1.5 text-sm border border-terracotta/40 text-terracotta rounded-md px-3 py-1.5 hover:bg-terracotta/5"
                                title="Permanently delete this statement"
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* STMT-UI-1 v2 · Decision 6: Notes editor sits directly under the
                header, above the decoded breakdown, per the spec layout. */}
            <StatementNotes
                statementId={stmt.id}
                initialNote={stmt.user_note || ""}
                onSaved={(patched) => {
                    setStmt((prev) => prev ? { ...prev, user_note: patched?.user_note ?? null, has_note: !!patched?.has_note } : prev);
                }}
            />

            {/* STMT-UI-1 v2 · Contextual Ask Wayly card. Grounded on this
                specific statement (server passes statement_id → focused
                summary + line items + anomalies as LLM context). */}
            <StatementAskWayly
                statementId={stmt.id}
                providerName={providerName(stmt)}
                periodLabel={periodCompact(stmt)}
            />

            {isArchived && (
                <div className="flex gap-2 rounded-lg border border-terracotta/40 bg-terracotta/5 p-3 text-terracotta text-sm" data-testid="statement-archived-banner">
                    <Archive className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="leading-relaxed">
                        <strong>This statement is archived</strong> and hidden from your dashboard, reports, and AI assistant. Restore it within 30 days to bring it back.
                    </div>
                </div>
            )}

            <NeedsReviewBanner confidence={stmt.parsing_confidence} />

            <SmartAISummary
                pageKey="statement-detail"
                context={{
                    provider: providerName(stmt),
                    period: periodExact(stmt),
                    gross_aud: stmt.audit_json?.statement_summary?.total_gross ?? null,
                    you_paid_aud: stmt.audit_json?.statement_summary?.total_participant_contribution ?? null,
                    government_paid_aud: stmt.audit_json?.statement_summary?.total_government_paid ?? null,
                    anomaly_count: flagsCount(stmt),
                    anomaly_dollar_impact: stmt.anomaly_dollar_impact_total ?? null,
                }}
            />

            <StatementInsightGraphics stmt={stmt} />

            {/* DEC-1 Phase 1: when the statement carries the rich decoder
                payload (audit_json + extracted_json), render the exact same
                view as the AI Tools pathway. Legacy statements (pre-unification)
                fall through to the simple detail view below. */}
            {stmt.audit_json && stmt.extracted_json ? (
                <div data-testid="statement-decoder-view">
                    <AIAccuracyBanner className="mb-2" />
                    <DecoderResultView result={{
                        extracted: stmt.extracted_json,
                        audit: stmt.audit_json,
                        input_method: stmt.input_method,
                        parsing_warnings: stmt.parsing_warnings,
                        summary: stmt.summary,
                    }} />
                </div>
            ) : (
            <>
            {stmt.summary && (
                <AIAccuracyBanner className="mb-2" />
            )}

            {stmt.summary && (
                <div className="sect-teal rounded-xl p-6 border border-kindred" data-testid="summary-card">
                    <span className="overline">In plain English</span>
                    <p className="mt-3 text-primary-k leading-relaxed">{stmt.summary}</p>
                </div>
            )}

            {(stmt.anomalies || []).length > 0 && (
                <div className="sect-clay border border-kindred rounded-xl p-6" data-testid="anomalies-card">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="overline">Things To Know</span>
                        {stmt.anomaly_dollar_impact_total > 0 && (
                            <span data-testid="anomalies-total-impact" className="text-xs rounded-full bg-terracotta/10 text-terracotta px-2.5 py-1 tabular-nums">
                                Could affect ${Number(stmt.anomaly_dollar_impact_total).toFixed(2)}
                            </span>
                        )}
                    </div>
                    <ul className="mt-4 space-y-3">
                        {stmt.anomalies.map((a, aIdx) => (
                            <FlagCard
                                key={a.id}
                                idx={aIdx}
                                severity={a.severity === "alert" ? "high" : a.severity === "info" ? "low" : "medium"}
                                title={a.title}
                                detail={a.detail}
                                action={a.suggested_action}
                                evidence={a.evidence}
                                dollarImpact={a.dollar_impact}
                                testId={`anomaly-${a.rule || a.id}`}
                            />
                        ))}
                    </ul>
                    <div className="mt-3">
                        <AIAccuracyBanner variant="anomaly" />
                    </div>
                </div>
            )}

            <div className="sect-sage border border-kindred rounded-xl overflow-hidden" data-testid="line-items-table">
                <div className="px-6 py-4 border-b border-kindred">
                    <span className="overline">Line items</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-muted-k">
                            <tr>
                                <th className="text-left px-6 py-3 font-medium">Date</th>
                                <th className="text-left px-6 py-3 font-medium">Service</th>
                                <th className="text-left px-6 py-3 font-medium">Stream</th>
                                <th className="text-right px-6 py-3 font-medium">Units</th>
                                <th className="text-right px-6 py-3 font-medium">Rate</th>
                                <th className="text-right px-6 py-3 font-medium">Total</th>
                                <th className="text-right px-6 py-3 font-medium">You paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(stmt.line_items || []).map((li) => (
                                <tr key={li.id} className="border-t border-kindred">
                                    <td className="px-6 py-3 whitespace-nowrap tabular-nums">{formatDate(li.date)}</td>
                                    <td className="px-6 py-3">{li.service_name}</td>
                                    <td className="px-6 py-3">
                                        <span className={`inline-block text-xs rounded-full px-2 py-0.5 ${STREAM_BADGE[li.stream]}`}>
                                            {li.stream}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">{li.units}</td>
                                    <td className="px-6 py-3 text-right">{formatAUD2(li.unit_price)}</td>
                                    <td className="px-6 py-3 text-right">{formatAUD2(li.total)}</td>
                                    <td className="px-6 py-3 text-right">{formatAUD2(li.contribution_paid)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}

            <StatementRightsPanel statementId={id} />

            <div className="flex justify-end">
                <Link
                    to="/app/ask-wayly"
                    data-testid="ask-kindred-cta"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90"
                >
                    <MessageCircle className="h-4 w-4" /> Ask Wayly about this
                </Link>
            </div>

            <ArchiveConfirmModal
                open={!!archiveImpact}
                onClose={() => !archiveBusy && setArchiveImpact(null)}
                impact={archiveImpact}
                busy={archiveBusy}
                onConfirm={confirmArchive}
            />
            <PermanentDeleteModal
                open={deleteOpen}
                onClose={() => !deleteBusy && setDeleteOpen(false)}
                statement={stmt}
                busy={deleteBusy}
                onConfirm={confirmPermanentDelete}
                onDownloadOriginal={downloadOriginal}
            />
        </div>
    );
}

// ------------------------------------------------------------
// Auto-Reconcile on Upload, one-tap prompt on the Statement
// detail page. Hidden if the statement has no line items or the
// user has already reconciled/dismissed it locally.
// ------------------------------------------------------------
function ReconcileWithPacingPrompt({ stmt }) {
    const { items: participants, activeId } = useParticipants();
    const active = (participants || []).find((p) => p.id === activeId) || (participants || [])[0];
    const [busy, setBusy] = useState(false);
    const [state, setState] = useState("idle"); // idle | success | error
    const [result, setResult] = useState(null);
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(`wayly:qp1:recon:${stmt?.id}`) === "1"; } catch { return false; }
    });

    if (!stmt || dismissed) return null;
    const hasLines = (stmt.line_items || []).length > 0;
    if (!hasLines || !active) return null;

    async function reconcile() {
        setBusy(true);
        setState("idle");
        try {
            const { data } = await api.post("/qp1/reconciliations/from-statement", {
                participant_id: active.id,
                statement_id: stmt.id,
                create_adhoc_for_unmatched: true,
            });
            setResult(data);
            setState("success");
            try { localStorage.setItem(`wayly:qp1:recon:${stmt.id}`, "1"); } catch { /* noop */ }
            toast.success(`Reconciled ${data.matched_count} lines · ${data.unmatched_count} logged as ad-hoc`);
        } catch (e) {
            setState("error");
            toast.error(extractErrorMessage(e) || "Could not reconcile");
        } finally {
            setBusy(false);
        }
    }

    function dismiss() {
        try { localStorage.setItem(`wayly:qp1:recon:${stmt.id}`, "1"); } catch { /* noop */ }
        setDismissed(true);
    }

    if (state === "success" && result) {
        return (
            <aside
                className="rounded-2xl border border-sage/50 bg-sage/10 p-4 sm:p-5 flex items-start gap-4"
                data-testid="statement-reconcile-success"
            >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sage text-white shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                    <div className="font-heading text-lg text-primary-k">Reconciled with your pacing</div>
                    <p className="mt-1 text-sm text-primary-k/85">
                        {result.matched_count} matched · {result.unmatched_count} logged as ad-hoc · {result.lines_considered} lines from this statement.
                    </p>
                    <Link
                        to="/app/pacing"
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary-k underline hover:no-underline"
                        data-testid="statement-reconcile-goto-pacing"
                    >
                        Open Quarterly Pacing <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </aside>
        );
    }

    return (
        <aside
            className="relative overflow-hidden rounded-2xl border-2 border-wayly-clay-400/50 bg-gradient-to-br from-wayly-clay-50 via-white to-sage/10 p-5 sm:p-6 flex items-start gap-4 shadow-sm"
            data-testid="statement-reconcile-prompt"
        >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-wayly-clay-500" />
            <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-wayly-clay-500 text-white shrink-0 shadow-sm">
                <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-full bg-wayly-clay-500 text-white text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 font-semibold">
                        New, recommended
                    </span>
                    <span className="text-[11px] text-muted-k uppercase tracking-wider">
                        {(stmt.line_items || []).length} lines ready
                    </span>
                </div>
                <h2 className="mt-2 font-heading text-lg sm:text-xl text-primary-k tracking-tight">
                    Reconcile this statement against Quarterly Pacing?
                </h2>
                <p className="mt-1.5 text-sm text-primary-k/85 leading-relaxed max-w-2xl">
                    We'll match each decoded line to your ledger within a small tolerance and lift your pacing
                    confidence. Non-matching lines get logged as ad-hoc so nothing disappears.
                </p>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <button
                        type="button"
                        onClick={reconcile}
                        disabled={busy}
                        data-testid="statement-reconcile-btn"
                        className="inline-flex items-center gap-2 rounded-full bg-wayly-clay-500 text-white px-5 py-2 text-sm font-semibold hover:bg-wayly-clay-600 shadow-md transition disabled:opacity-60"
                    >
                        {busy ? "Reconciling…" : "Reconcile now"}
                        <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={dismiss}
                        disabled={busy}
                        className="text-sm text-muted-k hover:text-primary-k underline"
                        data-testid="statement-reconcile-dismiss"
                    >
                        Not now
                    </button>
                </div>
            </div>
        </aside>
    );
}

