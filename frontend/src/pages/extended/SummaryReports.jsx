import React, { useEffect, useState } from "react";
import { FileBarChart, Download as DownloadIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageShell } from "./_shared";

export default function SummaryReports() {
    const [downloading, setDownloading] = useState(false);
    const [period, setPeriod] = useState("quarter");

    const download = async () => {
        setDownloading(true);
        try {
            const res = await api.get(`/reports/summary.pdf?period=${period}`, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `wayly-summary-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Summary downloaded");
        } catch (err) {
            toast.error("Could not generate the summary right now.");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <PageShell
            testid="reports-page"
            overline="Summary reports"
            title="One-page household summary"
            description="A clean, printable summary of statements, anomalies, visits, documents and concerns — useful for GP reviews, family meetings, or your own records."
        >
            <div className="bg-surface border border-kindred rounded-xl p-5 flex flex-wrap items-center justify-between gap-4" data-testid="reports-controls">
                <div className="flex items-center gap-3">
                    <FileBarChart className="h-6 w-6 text-gold" />
                    <div>
                        <div className="text-xs uppercase tracking-wider text-muted-k">Generate PDF</div>
                        <div className="text-sm text-primary-k">Reflects everything in your vault and statements right now.</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="reports-period" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                        <option value="quarter">Last quarter</option>
                        <option value="all">All time</option>
                    </select>
                    <button
                        type="button"
                        onClick={download}
                        disabled={downloading}
                        data-testid="reports-download-btn"
                        className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#091D33] disabled:opacity-60"
                    >
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
                        {downloading ? "Generating…" : "Download PDF"}
                    </button>
                </div>
            </div>
            <div className="bg-primary-k text-white rounded-2xl p-7" data-testid="reports-roadmap">
                <h3 className="font-heading text-xl tracking-tight">Coming next</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-white/85">
                    <li>· Schedule recurring monthly summaries by email</li>
                    <li>· Embed lifetime-cap forecast chart inside the PDF</li>
                    <li>· One-click share-as-link with view-only access</li>
                </ul>
            </div>
        </PageShell>
    );
}
