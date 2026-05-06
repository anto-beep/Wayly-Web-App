import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatAUD2 } from "@/lib/api";
import { AlertTriangle, ArrowLeft, Download, FileDown, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import AIAccuracyBanner from "@/components/AIAccuracyBanner";
import { downloadDecodedAsCsv, downloadDecodedAsPdf } from "@/lib/decoderExport";

const STREAM_BADGE = {
    Clinical: "bg-[#3A5A40] text-white",
    Independence: "bg-[#8B9B82] text-white",
    "Everyday Living": "bg-[#A05545] text-white",
};

export default function StatementDetail() {
    const { id } = useParams();
    const [stmt, setStmt] = useState(null);
    const [loading, setLoading] = useState(true);

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

    return (
        <div className="space-y-6" data-testid="statement-detail-page">
            <Link to="/app/statements" className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k">
                <ArrowLeft className="h-4 w-4" /> Back to statements
            </Link>
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <span className="overline">Statement</span>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">
                        {stmt.period_label || stmt.filename}
                    </h1>
                    <p className="text-muted-k mt-1 text-sm">
                        {(stmt.line_items || []).length} line items · {formatAUD2(total)} total · {formatAUD2(totalContribution)} contribution
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {stmt.file_b64 !== false && (
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    const resp = await api.get(`/statements/${stmt.id}/download`, { responseType: "blob" });
                                    const blob = resp.data;
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = stmt.filename || "statement";
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    URL.revokeObjectURL(url);
                                } catch {
                                    toast.error("Original file isn't available for this statement.");
                                }
                            }}
                            className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface-2 text-primary-k"
                            data-testid="statement-download-original-btn"
                            title="Download the original file you uploaded"
                        >
                            <Download className="h-3.5 w-3.5" /> Original ({(stmt.filename || "").split(".").pop().toUpperCase() || "file"})
                        </button>
                    )}
                    <button
                        onClick={() => downloadDecodedAsCsv(stmt, "statement")}
                        className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 hover:bg-surface-2 text-primary-k"
                        data-testid="statement-download-csv-btn"
                        title="Download decoded line items as CSV"
                    >
                        <FileDown className="h-3.5 w-3.5" /> Decoded CSV
                    </button>
                    <button
                        onClick={() => downloadDecodedAsPdf(stmt, "statement")}
                        className="inline-flex items-center gap-1.5 text-sm bg-primary-k text-white rounded-md px-3 py-1.5 hover:bg-[#16294a]"
                        data-testid="statement-download-pdf-btn"
                        title="Download decoded summary as PDF"
                    >
                        <FileDown className="h-3.5 w-3.5" /> Decoded PDF
                    </button>
                </div>
            </div>

            {stmt.summary && (
                <AIAccuracyBanner className="mb-2" />
            )}

            {stmt.summary && (
                <div className="bg-surface-2 rounded-xl p-6 border border-kindred" data-testid="summary-card">
                    <span className="overline">In plain English</span>
                    <p className="mt-3 text-primary-k leading-relaxed">{stmt.summary}</p>
                </div>
            )}

            {(stmt.anomalies || []).length > 0 && (
                <div className="bg-surface border border-kindred rounded-xl p-6" data-testid="anomalies-card">
                    <span className="overline">Things to know</span>
                    <ul className="mt-4 space-y-3">
                        {stmt.anomalies.map((a) => (
                            <li key={a.id} className="flex items-start gap-3 border-b border-kindred pb-3 last:border-0">
                                <AlertTriangle className={`h-4 w-4 mt-1 ${a.severity === "alert" ? "text-terracotta" : "text-sage"}`} />
                                <div className="flex-1">
                                    <div className="font-medium text-primary-k text-sm">{a.title}</div>
                                    <div className="text-xs text-muted-k mt-0.5">{a.detail}</div>
                                    {a.suggested_action && (
                                        <div className="text-xs text-primary-k mt-1.5 italic">→ {a.suggested_action}</div>
                                    )}
                                    <div className="mt-2">
                                        <AIAccuracyBanner variant="anomaly" />
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="line-items-table">
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
                                    <td className="px-6 py-3 whitespace-nowrap">{li.date}</td>
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

            <div className="flex justify-end">
                <Link
                    to="/app/chat"
                    data-testid="ask-kindred-cta"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-primary-k/90"
                >
                    <MessageCircle className="h-4 w-4" /> Ask Kindred about this
                </Link>
            </div>
        </div>
    );
}
